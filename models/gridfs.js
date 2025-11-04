// file: utils/gridfs.js

const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");

let gfsBucket = null;

function initGridFS(connection) {
    if (!connection || !connection.db) throw new Error("Invalid mongoose connection.");
    gfsBucket = new GridFSBucket(connection.db, {
        bucketName: "uploads" // You can change this to 'files' or something else
    });
    console.log("✅ GridFS Bucket initialized");
}

function getGridFSBucket() {
    if (!gfsBucket) throw new Error("GridFSBucket is not initialized yet.");
    return gfsBucket;
}

module.exports = { initGridFS, getGridFSBucket };
