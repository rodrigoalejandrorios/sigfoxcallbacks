"use strict";
require("dotenv").config();
require("path");
const sql = require("mssql");
const handlebars = require("handlebars");
const Hapi = require("@hapi/hapi");

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

sql.connect(sqlConfig);
const pool = new sql.Request();

/*const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});*/

const start = async () => {
  const server = Hapi.server({
    host: process.env.HOST || "0.0.0.0",
    port: process.env.PORT,
  });
  await server.register(require("@hapi/vision"));

  server.views({
    engines: {
      html: handlebars,
    },
    relativeTo: __dirname,
    path: "views",
  });

  server.route({
    method: "GET",
    path: "/",
    handler: handlers.home,
  });

  //UPLINK
  server.route({
    method: "POST",
    path: "/smc",
    handler: handlers.uplinkCallback,
  });
  server.route({
    method: "POST",
    path: "/caudalimetro",
    handler: handlers.uplinkCallback,
  });

  server.route({
    method: "POST",
    path: "/medidorgas",
    handler: handlers.uplinkCallback,
  });

  //DOWNLINK
  server.route({
    method: "POST",
    path: "/downlink",
    handler: handlers.downlinkCallback,
  });
  await server.start();

  console.log("Server running at:", server.info.uri);
};

const insertCallback = async (type, request) => {
  try {
    //console.log("Insert type: " + type);

    const qry = `INSERT INTO callbacks(device, data, time) VALUES (${request.payload.device},${request.payload.data} , ${request.payload.time})`;

    await pool.query(qry, function (err, result) {
      if (err) throw err;
      console.log("Insert success in type: " + type);
    });
  } catch (err) {
    console.log("Error inserting: " + err.message);
  }
};
const recordCallback = async (type, request) => {
  return insertCallback(type, request)
    .then((res) => {
      console.log(res + " Records");
    })
    .catch((err) => {
      console.log("SQL Err", err.stack);
    });
};
const getDownlinkString = (number, station, rssi) => {
  //Downlink data is 8 Bytes
  //We'll send a number over 2 bytes, the ID of the Sigfox station over 4 bytes, and the received signal strength on this staiton over the last 2 bytes
  var arr = new ArrayBuffer(8);
  var view = new DataView(arr);
  //Bytes 0-1 : number
  view.setUint16(0, number, false); //Start at byte 0, false = Big Endian
  //Bytes 2-5 : station id. Input is an hex string
  view.setUint32(2, parseInt(station, 16), false);
  //Bytes 6-7 : rssi (signed int)
  view.setInt16(6, rssi, false);
  var response = [];
  for (var i = 0; i < arr.byteLength; i++) {
    var byte = view.getUint8(i, false).toString(16);
    if (byte < 0x10) byte = "0" + byte;
    response.push(byte);
  }
  return response.join("");
};

const handlers = {
  home: (request, h) => {
    return pool
      .query("select * from callbacks order by date desc")
      .then((res) => {
        return h.view("list", { rows: res.rows });
      })
      .catch((e) => {
        console.log(e.stack);
        return {};
      });
  },
  uplinkCallback: (request, h) => {
    recordCallback("unacosa", request);
    return h.response("Callback received").code(200);
  },
  downlinkCallback: (request, h) => {
    return insertCallback("otracosa", request)
      .then((res) => {
        console.log("Ahora acaaa");
        let recordId = res.rows.pop().id;
        console.log("• New record #", recordId);
        var downlinkData = new Number(recordId).toString(16);
        while (downlinkData.length < 16) downlinkData = "0" + downlinkData;
        return h
          .response({
            [request.payload.device]: {
              downlinkData: getDownlinkString(
                recordId,
                request.payload.station,
                request.payload.rssi
              ),
            },
          })
          .code(200);
      })
      .catch((err) => {
        let msg = "An error occurred while handling the downlink callbacks";
        console.log(msg);
        console.log(err.stack);
        return h.response(msg).code(500);
      });
  },
};

start();
