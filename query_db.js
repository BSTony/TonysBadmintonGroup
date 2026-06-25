const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT gid, data FROM games').then(res => {
  console.log('Total rows:', res.rowCount);
  res.rows.forEach(r => console.log(r.gid, typeof r.data, typeof r.data === 'string' ? r.data.substring(0, 50) : Object.keys(r.data)));
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
