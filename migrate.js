
const OLD_FILE_RECORDS = 'cfs.attachments.filerecord';
const OLD_GRIDFS_FILES = 'cfs_gridfs.attachments.files';
const OLD_GRIDFS_CHUNKS = 'cfs_gridfs.attachments.chunks';

const NEW_ATTACHMENTS = 'attachments';
const NEW_GRIDFS_FILES = 'attachments.files';
const NEW_GRIDFS_CHUNKS = 'attachments.chunks';

print(`Starting migration for database: ${db.getName()}`);
print("ENSURE YOU HAVE A BACKUP OF YOUR DATABASE BEFORE PROCEEDING.");


let migratedCount = 0;
let errorCount = 0;

const cursor = db.getCollection(OLD_FILE_RECORDS).find();

cursor.forEach(oldFileRecord => {
  try {
    const oldGridfsFileId = oldFileRecord.copies.attachments.key;
    if (!oldGridfsFileId) {
      print(`WARNING: Skipping record ${oldFileRecord._id} because it has no GridFS key.`);
      return;
    }

    const oldGridfsFile = db.getCollection(OLD_GRIDFS_FILES).findOne({ _id: ObjectId(oldGridfsFileId) });
    if (!oldGridfsFile) {
      print(`WARNING: Skipping record ${oldFileRecord._id} because its GridFS file (${oldGridfsFileId}) was not found.`);
      return;
    }
    
    const newAttachmentId = oldFileRecord._id; 
    const newGridfsFileId = oldGridfsFile._id;

 
    const newGridfsFileDoc = {
      _id: newGridfsFileId,
      length: oldGridfsFile.length,
      chunkSize: oldGridfsFile.chunkSize,
      uploadDate: oldGridfsFile.uploadDate,
      filename: `__${oldGridfsFile.filename}`,
      contentType: oldGridfsFile.contentType,
      metadata: {
        boardId: oldFileRecord.boardId,
        swimlaneId: oldFileRecord.swimlaneId || null, 
        listId: oldFileRecord.listId || null,
        cardId: oldFileRecord.cardId,
        userId: oldFileRecord.userId,
        versionName: "original",
        fileId: newAttachmentId
      }
    };


    const newAttachmentDoc = {
      _id: newAttachmentId,
      size: oldGridfsFile.length,
      type: oldGridfsFile.contentType,
      name: oldGridfsFile.filename,
      ext: oldGridfsFile.filename.split('.').pop(),
      extension: oldGridfsFile.filename.split('.').pop(),
      extensionWithDot: `.${oldGridfsFile.filename.split('.').pop()}`,
      userId: oldFileRecord.userId,
      path: `/data/attachments/${newGridfsFileId.toHexString()}`,
      _collectionName: "attachments",
      _downloadRoute: "/cdn/storage",
      _storagePath: "/data/attachments",
      isImage: oldGridfsFile.contentType.startsWith('image/'),
      isAudio: oldGridfsFile.contentType.startsWith('audio/'),
      isVideo: oldGridfsFile.contentType.startsWith('video/'),
      isText: oldGridfsFile.contentType.startsWith('text/'),
      isJSON: oldGridfsFile.contentType.includes('json'),
      isPDF: oldGridfsFile.contentType.includes('pdf'),
      public: false, 
      meta: {
        boardId: oldFileRecord.boardId,
        swimlaneId: oldFileRecord.swimlaneId || null,
        listId: oldFileRecord.listId || null,
        cardId: oldFileRecord.cardId,
      },
      versions: {
        original: {
          path: `/data/attachments/${newGridfsFileId.toHexString()}-original-${oldGridfsFile.filename}`,
          size: oldGridfsFile.length,
          type: oldGridfsFile.contentType,
          extension: oldGridfsFile.filename.split('.').pop(),  
          storage: "gridfs",
          meta: {
            gridfsFileId: oldGridfsFile._id.toHexString(),
          }

        }
      }
    };
    
    db.getCollection(NEW_ATTACHMENTS).updateOne({ _id: newAttachmentDoc._id }, { $set: newAttachmentDoc }, { upsert: true });
    db.getCollection(NEW_GRIDFS_FILES).updateOne({ _id: newGridfsFileDoc._id }, { $set: newGridfsFileDoc }, { upsert: true });

    migratedCount++;
    if (migratedCount % 100 === 0) {
      print(`Processed ${migratedCount} file records...`);
    }

  } catch (e) {
    errorCount++;
    print(`ERROR processing record ${oldFileRecord._id}: ${e.message}`);
  }
});

print(`--- File Metadata Migration Complete ---`);
print(`Successfully migrated ${migratedCount} file records.`);
if (errorCount > 0) {
  print(`Encountered ${errorCount} errors.`);
}


print("\n--- Starting Chunk Migration ---");
print("This may take some time depending on the total size of your attachments...");

try {
  const pipeline = [
    {
      $project: {
        _id: '$$ROOT._id',
        files_id: '$$ROOT.files_id',
        n: '$$ROOT.n',
        data: '$$ROOT.data'
      }
    },
    {
      $merge: {
        into: NEW_GRIDFS_CHUNKS,
        on: '_id',
        whenMatched: 'replace',
        whenNotMatched: 'insert'
      }
    }
  ];

  db.getCollection(OLD_GRIDFS_CHUNKS).aggregate(pipeline);

  const oldChunkCount = db.getCollection(OLD_GRIDFS_CHUNKS).countDocuments();
  const newChunkCount = db.getCollection(NEW_GRIDFS_CHUNKS).countDocuments();
  
  print(`--- Chunk Migration Complete ---`);
  print(`Old chunk count: ${oldChunkCount}`);
  print(`New chunk count: ${newChunkCount}`);
  if (oldChunkCount !== newChunkCount) {
      print(`WARNING: Chunk counts do not match. Please review.`);
  }

} catch (e) {
  print(`FATAL ERROR during chunk migration: ${e.message}`);
}

print("\nMigration process finished.");