// Test harness: runs the REAL supabase-schema.sql inside PGlite (PostgreSQL compiled to
// WebAssembly) with a small emulation of Supabase's auth so row-level security can be tested
// automatically, without a live project.
//
// What we emulate (the same way Supabase works):
// - auth.users table and auth.uid(), which reads the signed-in user's id from
//   the request.jwt.claim.sub setting
// - the "authenticated" and "anon" roles, with Supabase's default grants on public tables.
//   RLS policies are what actually protect the data.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const SCHEMA = readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');
const MIGRATIONS_DIR = new URL('../supabase/migrations/', import.meta.url);

export const USERS = {
  alice: '00000000-0000-4000-8000-00000000000a', // owner of circle A
  bob: '00000000-0000-4000-8000-00000000000b',   // member of circle A (via invitation)
  carol: '00000000-0000-4000-8000-00000000000c', // owner of circle B (a different family)
  eve: '00000000-0000-4000-8000-00000000000e',   // signed in, in no circle
};

export async function createDatabase({ migrations = [] } = {}) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`
    create extension if not exists pgcrypto;
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(SCHEMA);
  for (const name of migrations) {
    await db.exec(readFileSync(new URL(name, MIGRATIONS_DIR), 'utf8'));
  }
  // Supabase's default privileges: API roles get table access, and RLS decides which rows.
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant execute on all functions in schema public to anon, authenticated;
  `);
  for (const id of Object.values(USERS)) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
  }
  return db;
}

/**
 * Run fn as a signed-in user (or as anon if userId is null), inside a transaction that is
 * always rolled back unless keep is true. Returns whatever fn returns.
 */
export async function as(db, userId, fn, { keep = true } = {}) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    if (userId) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    const result = await fn(tx);
    if (!keep) await tx.rollback();
    return result;
  });
}

/** Run a query as a user and return the rows. */
export async function rowsAs(db, userId, sql, params = []) {
  return as(db, userId, async (tx) => (await tx.query(sql, params)).rows, { keep: false });
}

/** Expect a statement to be refused by the database; returns the error message. */
export async function refused(db, userId, sql, params = []) {
  try {
    await as(db, userId, (tx) => tx.query(sql, params), { keep: false });
  } catch (err) {
    return err.message;
  }
  throw new Error(`Expected the database to refuse: ${sql}`);
}

/** Build the standard two-family scenario used by most tests. */
export async function seed(db) {
  const ids = {};
  for (const [name, id] of Object.entries(USERS)) {
    await as(db, id, (tx) => tx.query('insert into user_profiles (id, display_name) values ($1, $2)', [id, name]));
  }
  ids.circleA = (await as(db, USERS.alice, (tx) =>
    tx.query(`insert into care_circles (name, created_by) values ('Mum''s care', $1) returning id`, [USERS.alice]))).rows[0].id;
  ids.circleB = (await as(db, USERS.carol, (tx) =>
    tx.query(`insert into care_circles (name, created_by) values ('Dad''s care', $1) returning id`, [USERS.carol]))).rows[0].id;

  ids.inviteA = (await as(db, USERS.alice, (tx) =>
    tx.query('insert into invitations (circle_id, created_by) values ($1, $2) returning token', [ids.circleA, USERS.alice]))).rows[0].token;
  await as(db, USERS.bob, (tx) => tx.query('select redeem_invitation($1)', [ids.inviteA]));

  ids.medA = (await as(db, USERS.alice, (tx) =>
    tx.query(`insert into medications (circle_id, name, dosage, added_by) values ($1, 'Metformin', '500mg', $2) returning id`, [ids.circleA, USERS.alice]))).rows[0].id;
  ids.medB = (await as(db, USERS.carol, (tx) =>
    tx.query(`insert into medications (circle_id, name, dosage, added_by) values ($1, 'Warfarin', '3mg', $2) returning id`, [ids.circleB, USERS.carol]))).rows[0].id;
  ids.apptA = (await as(db, USERS.alice, (tx) =>
    tx.query(`insert into appointments (circle_id, date, doctor_name, added_by) values ($1, current_date + 3, 'Dr Patel', $2) returning id`, [ids.circleA, USERS.alice]))).rows[0].id;
  ids.noteA = (await as(db, USERS.alice, (tx) =>
    tx.query(`insert into care_notes (circle_id, author_id, content) values ($1, $2, 'Had a good day') returning id`, [ids.circleA, USERS.alice]))).rows[0].id;
  ids.noteB = (await as(db, USERS.carol, (tx) =>
    tx.query(`insert into care_notes (circle_id, author_id, content) values ($1, $2, 'Hospital on Friday') returning id`, [ids.circleB, USERS.carol]))).rows[0].id;
  await as(db, USERS.carol, (tx) =>
    tx.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth_key) values ($1, 'https://push.example/carol', 'k', 'a')`, [USERS.carol]));
  return ids;
}
