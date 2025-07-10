const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');


const MONGO_URI = "mongodb://localhost:27017/";
const DB_NAME = "wekan";

const GRIDFS_BUCKET_NAME = "attachments";

async function downloadFileById(bucket, fileIdStr) {
    let fileObjectId;
    try {
        fileObjectId = new ObjectId(fileIdStr);
    } catch (e) {
        console.error(`Error: '${fileIdStr}' is not a valid ObjectId. Skipping.`);
        return;
    }

    const cursor = bucket.find({ _id: fileObjectId });
    const gridfsFile = await cursor.next();

    if (!gridfsFile) {
        console.log(`File with ID '${fileIdStr}' not found in GridFS. Skipping.`);
        return;
    }

    const outputDir = path.join(process.cwd(), GRIDFS_BUCKET_NAME);
    await fs.promises.mkdir(outputDir, { recursive: true });

    const originalFilename = gridfsFile.filename.replace(/^_+/, ''); 
    const outputFilename = `${fileIdStr}-original-${originalFilename}`;
    const outputPath = path.join(outputDir, outputFilename);

    console.log(`Downloading: ${gridfsFile.filename} (ID: ${fileIdStr})`);
    console.log(`  -> Saving to: ${outputPath}`);

    const downloadStream = bucket.openDownloadStream(fileObjectId);
    const fileStream = fs.createWriteStream(outputPath);
    
    try {
        await pipeline(downloadStream, fileStream);
        console.log("  -> Success!");
    } catch (error) {
        console.error(`  -> FAILED to write file: ${error.message}`);
    }
}


async function main() {
    const client = new MongoClient(MONGO_URI);

    try {
        await client.connect();
        console.log("Successfully connected to MongoDB.");

        const db = client.db(DB_NAME);
        const bucket = new GridFSBucket(db, { bucketName: GRIDFS_BUCKET_NAME });


        console.log("\n--- Downloading all files referenced in the 'attachments' collection ---");
        const attachmentsCollection = db.collection('attachments');
        const cursor = attachmentsCollection.find({});
        for await (const doc of cursor) {

            const fileId = doc?.versions?.original?.meta?.gridfsFileId;
            if (fileId) {
                await downloadFileById(bucket, fileId);
            } else {
                console.log(`Skipping document with _id ${doc._id} as it has no gridfsFileId.`);
            }
        }

    } finally {
        await client.close();
        console.log("MongoDB connection closed.");
    }
}

main().catch(console.error);