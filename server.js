// 1.setup env
require("rootpath")();
const path = require("path");
const fs = require('fs');
const dotenv = require('dotenv');


process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const envFilePath = path.join(__dirname, 'utils', `.env.${process.env.NODE_ENV}`);
if (fs.existsSync(envFilePath)) {
  dotenv.config({ path: envFilePath });
  console.info(`1. Environment file ${envFilePath}`);
} else {
  dotenv.config({ path: path.join(__dirname, '.env') });
  console.info(`1. Environment file ${envFilePath} Not found, Loading from process.env`);
}

// 2.setup system logger
const { systemLogger } = require('./www/initServer/initSysLogger')

// 3.create directory
const { createDirectory } = require('./www/initServer/initDirectory')
createDirectory()


const { mongoBackup } = require("./utils/dbBackup");
const { dbConnect, closeDB, listCollections } = require("./www/initServer/initDB");
const { redisConnect, redisClient } = require("./www/initServer/initRedis");


// */5 * * * * *
// 0 0 * * *
const cron = require("node-cron");
cron.schedule('0 0 * * *', async () => {
  try {
    const collections = await listCollections()
    await mongoBackup(collections);
  } catch (error) {
    systemLogger.error(`Hi Failed to perform backup: ${error}`);

  }
});

if (process.env.NODE_ENV === "production") {
  process.on("uncaughtException", (err) => {
    systemLogger.error(`${err.name} : ${err.message} : ${err.stack}`);
    systemLogger.info("Uncaught Exception occurred! Shutting down...");
    process.exit(0); // clean exit
  });
}

// await dbConnect();
// await connectRedis();
// await mongoBackup() //test backup is working or not


let server

(async () => {
  try {
    systemLogger.info("4. Initializing Server Setup......")
    await redisConnect()
    const collections = await dbConnect()
    // await mongoBackup(collections)
    const app = require("./app");

    process.env.NODE_PORT = process.env.NODE_PORT || 5000;
    // process.env.NODE_ENV = process.env.NODE_ENV || "development"

    server = app.listen(process.env.NODE_PORT)
    server.on("listening", () => {
      systemLogger.info(`Server PORT ==> ${process.env.NODE_PORT}`);
      systemLogger.info(`Node ENV ==>  ${process.env.NODE_ENV}`);
      systemLogger.info(`Node Version ==>${process.version}`);
    });
    // Event handler for server error
    server.on("error", async (error) => {
      systemLogger.error("Express Server Error");
      await closeDB()
      await redisClient.disconnect()
      systemLogger.error(error.message)
      server.close();
    });

    // Event handler for server close
    server.on("close", async () => {
      systemLogger.info("Server closed");
      process.exit(0)
    });

    process.on("SIGINT", () => {
      server.close();
    });

  } catch (error) {
    systemLogger.error(error.stack);
    process.exit(1)
  }
})()





process.on("unhandledRejection", async (err) => {
  systemLogger.error(`${err.name}: ${err.message} : ${err.stack}`);
  systemLogger.info("Unhandled rejection occurred! Shutting down...");
  process.exit(0)

});

