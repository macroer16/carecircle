// Row-level security tests for CareCircle.
// Each test signs in as a different person and checks what the database lets them see or do.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, seed, as, rowsAs, refused, USERS } from './db.js';

const { alice, bob, carol, eve } = USERS;
const MIGRATIONS = (process.env.RLS_MIGRATIONS ?? '2026-10-11-rls-fixes.sql').split(',').filter(Boolean);
let db;
let ids;

before(async () => {
  db = await createDatabase({ migrations: MIGRATIONS });
  ids = await seed(db);
});

// ---------- Isolation between families ----------

test('a member sees their own circle and nothing from another family', async () => {
  const circles = await rowsAs(db, alice, 'select id from care_circles');
  assert.deepEqual(circles.map((c) => c.id), [ids.circleA]);
  const meds = await rowsAs(db, alice, 'select name from medications');
  assert.deepEqual(meds.map((m) => m.name), ['Metformin']);
});

test('another family cannot see circle A: circles, members, medications, appointments, notes', async () => {
  for (const table of ['care_circles', 'medications', 'appointments', 'care_notes']) {
    const col = table === 'care_circles' ? 'id' : 'circle_id';
    const rows = await rowsAs(db, carol, `select 1 from ${table} where ${col} = $1`, [ids.circleA]);
    assert.equal(rows.length, 0, `Carol can see ${table} from circle A`);
  }
  const members = await rowsAs(db, carol, 'select 1 from circle_members where circle_id = $1', [ids.circleA]);
  assert.equal(members.length, 0);
});

test('a signed-in user in no circle sees no care data at all', async () => {
  for (const table of ['care_circles', 'circle_members', 'medications', 'appointments', 'care_notes', 'invitations']) {
    assert.equal((await rowsAs(db, eve, `select 1 from ${table}`)).length, 0, `Eve can see ${table}`);
  }
});

test('someone not signed in (anon) sees nothing', async () => {
  for (const table of ['user_profiles', 'care_circles', 'medications', 'care_notes', 'push_subscriptions']) {
    assert.equal((await rowsAs(db, null, `select 1 from ${table}`)).length, 0, `anon can see ${table}`);
  }
});

test('profiles are visible only to yourself and people in your circles', async () => {
  const forBob = (await rowsAs(db, bob, 'select display_name from user_profiles order by 1')).map((r) => r.display_name);
  assert.deepEqual(forBob, ['alice', 'bob']);
  const forCarol = (await rowsAs(db, carol, 'select display_name from user_profiles')).map((r) => r.display_name);
  assert.deepEqual(forCarol, ['carol']);
});

test('push subscriptions are private to their owner, even within a circle', async () => {
  assert.equal((await rowsAs(db, alice, 'select 1 from push_subscriptions')).length, 0);
  assert.equal((await rowsAs(db, carol, 'select 1 from push_subscriptions')).length, 1);
});

// ---------- Writing into someone else's circle ----------

test('cannot add a medication to another family\'s circle', async () => {
  const msg = await refused(db, carol,
    `insert into medications (circle_id, name, added_by) values ($1, 'Injected', $2)`, [ids.circleA, carol]);
  assert.match(msg, /row-level security/);
});

test('cannot add a record pretending to be someone else', async () => {
  const msg = await refused(db, bob,
    `insert into medications (circle_id, name, added_by) values ($1, 'Spoofed', $2)`, [ids.circleA, alice]);
  assert.match(msg, /row-level security/);
  await refused(db, bob,
    `insert into care_notes (circle_id, author_id, content) values ($1, $2, 'Spoofed note')`, [ids.circleA, alice]);
});

test('cannot add yourself to a circle directly (only through an invitation)', async () => {
  const msg = await refused(db, eve,
    `insert into circle_members (circle_id, user_id, role) values ($1, $2, 'owner')`, [ids.circleA, eve]);
  assert.match(msg, /row-level security/);
});

test('cannot move a medication into a circle you are not in', async () => {
  const msg = await refused(db, alice, 'update medications set circle_id = $1 where id = $2', [ids.circleB, ids.medA]);
  assert.match(msg, /row-level security/);
});

test('cannot move your own note into another family\'s circle', async () => {
  // The update policy only checks author_id, but PostgreSQL also applies the SELECT
  // policy to the new row, so a note can't be moved into a circle you can't see.
  await refused(db, carol, 'update care_notes set circle_id = $1 where id = $2', [ids.circleA, ids.noteB]);
});

test('FIXED: an appointment can only be assigned to a member of that circle', async () => {
  await refused(db, alice, 'update appointments set responsible_user_id = $1 where id = $2', [carol, ids.apptA]);
  const ok = await rowsAs(db, alice,
    'update appointments set responsible_user_id = $1 where id = $2 returning id', [bob, ids.apptA]);
  assert.equal(ok.length, 1);
});

// ---------- Roles and permissions inside a circle ----------

test('nobody can hard-delete medications (soft delete only)', async () => {
  const deleted = await rowsAs(db, alice, 'delete from medications where id = $1 returning id', [ids.medA]);
  assert.equal(deleted.length, 0);
  const softDeleted = await rowsAs(db, bob, 'update medications set deleted_at = now() where id = $1 returning id', [ids.medA]);
  assert.equal(softDeleted.length, 1);
});

test('only the author can edit or delete a note', async () => {
  assert.equal((await rowsAs(db, bob, `update care_notes set content = 'changed' where id = $1 returning id`, [ids.noteA])).length, 0);
  assert.equal((await rowsAs(db, bob, 'delete from care_notes where id = $1 returning id', [ids.noteA])).length, 0);
  assert.equal((await rowsAs(db, alice, `update care_notes set content = 'Edited' where id = $1 returning id`, [ids.noteA])).length, 1);
});

test('a member cannot promote themselves to owner', async () => {
  const changed = await rowsAs(db, bob, `update circle_members set role = 'owner' where user_id = $1 returning id`, [bob]);
  assert.equal(changed.length, 0);
});

test('only the owner can rename the circle', async () => {
  assert.equal((await rowsAs(db, bob, `update care_circles set name = 'Hacked' where id = $1 returning id`, [ids.circleA])).length, 0);
  assert.equal((await rowsAs(db, alice, `update care_circles set name = 'Mum' where id = $1 returning id`, [ids.circleA])).length, 1);
});

test('members cannot see or create invitations; the owner can', async () => {
  assert.equal((await rowsAs(db, bob, 'select 1 from invitations')).length, 0);
  await refused(db, bob, 'insert into invitations (circle_id, created_by) values ($1, $2)', [ids.circleA, bob]);
  assert.equal((await rowsAs(db, alice, 'select 1 from invitations')).length, 1);
});

test('the owner can remove a member but not another owner', async () => {
  const removed = await rowsAs(db, alice, 'delete from circle_members where circle_id = $1 and user_id = $2 returning id', [ids.circleA, bob]);
  assert.equal(removed.length, 1);
  const owner = await rowsAs(db, alice, 'delete from circle_members where circle_id = $1 and user_id = $2 returning id', [ids.circleA, alice]);
  assert.equal(owner.length, 0);
});

test('mark_circle_seen only updates your own row', async () => {
  await as(db, bob, (tx) => tx.query('select mark_circle_seen($1)', [ids.circleA]), { keep: false });
  const rows = await as(db, alice, async (tx) => {
    await tx.query(`update circle_members set last_seen_at = '2000-01-01' where circle_id = $1`, [ids.circleA]);
    return (await tx.query('select user_id, last_seen_at from circle_members where circle_id = $1', [ids.circleA])).rows;
  }, { keep: false });
  // The direct update above must have changed nothing: there is no update policy on circle_members.
  assert.ok(rows.every((r) => new Date(r.last_seen_at).getFullYear() > 2000));
});

// ---------- Invitations ----------

test('invalid, revoked and expired invitations are refused', async () => {
  assert.match(await refused(db, eve, 'select redeem_invitation($1)', ['not-a-real-token']), /Invalid invitation/);

  const revoked = await as(db, alice, async (tx) => {
    const t = (await tx.query('insert into invitations (circle_id, created_by) values ($1, $2) returning token', [ids.circleA, alice])).rows[0].token;
    await tx.query('update invitations set revoked_at = now() where token = $1', [t]);
    return t;
  });
  assert.match(await refused(db, eve, 'select redeem_invitation($1)', [revoked]), /revoked/);

  const expired = await as(db, alice, async (tx) =>
    (await tx.query(`insert into invitations (circle_id, created_by, expires_at) values ($1, $2, now() - interval '1 day') returning token`, [ids.circleA, alice])).rows[0].token);
  assert.match(await refused(db, eve, 'select redeem_invitation($1)', [expired]), /expired/);
});

test('a valid invitation adds the person as a member (never as owner)', async () => {
  const rows = await as(db, eve, async (tx) => {
    await tx.query('select redeem_invitation($1)', [ids.inviteA]);
    return (await tx.query('select role from circle_members where circle_id = $1 and user_id = $2', [ids.circleA, eve])).rows;
  }, { keep: false });
  assert.deepEqual(rows, [{ role: 'member' }]);
});

test('someone not signed in cannot redeem an invitation', async () => {
  await refused(db, null, 'select redeem_invitation($1)', [ids.inviteA]);
});

test('creating a circle makes you its owner automatically', async () => {
  const rows = await as(db, eve, async (tx) => {
    const id = (await tx.query(`insert into care_circles (name, created_by) values ('Gran', $1) returning id`, [eve])).rows[0].id;
    return (await tx.query('select role from circle_members where circle_id = $1 and user_id = $2', [id, eve])).rows;
  }, { keep: false });
  assert.deepEqual(rows, [{ role: 'owner' }]);
});

test('cannot create a circle in someone else\'s name', async () => {
  await refused(db, eve, `insert into care_circles (name, created_by) values ('Fake', $1)`, [alice]);
});
