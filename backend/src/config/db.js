import pg from 'pg'
import 'dotenv/config'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export async function query(text, params) {
  const res = await pool.query(text, params)
  return res
}

export default pool
