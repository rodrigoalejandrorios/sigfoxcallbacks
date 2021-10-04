require("./loadConfig.js");
require("dotenv").config();
const sql = require("mssql");

const sqlConfig = {
  user: process.env.USERDB,
  password: process.env.PASSDB,
  database: process.env.NAMEDB,
  server: process.env.SERVERDB,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: true, // for azure
    trustServerCertificate: true, // change to true for local dev / self-signed certs
  },
};

const connect = async () => {
  try {
    // make sure that any items are correctly URL encoded in the connection string}
    await sql.connect(sqlConfig);
    console.log("Connect into database");
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
};
connect();
const pool = new sql.Request();

const qry = require("fs").readFileSync("./init.sql", { encoding: "utf-8" });

sql.connect(function (err) {
  if (err) {
    console.error("⚠️\tUnable to connect to ", process.env.DATABASE_URL);
    process.exit(1);
  }
  pool.query(qry, function (err, result) {
    if (err) {
      console.warn("⚠️", err);
    } else {
      console.log(result);
      console.log("✅\tDatabase init succesful");
    }
    process.exit(0);
  });
});
