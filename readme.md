# Stable-SNAP to Docker Latest migration without losing attachments
> This process worked in my case with around 4000 attachments, but there is no guarantee it will work in every scenario. Test with your own data.
## Prerequisites

- [MongoDB Shell/ mongosh](https://www.mongodb.com/docs/mongodb-shell/)
- [Node JS](https://nodejs.org/en)

## Docker Compose Volumes
> Make sure your `docker-compose.yml` includes **both** of the following volume mappings for `wekandb` and `wekan-app`. These are required for the migration process to work correctly.
```yaml
wekandb:
  volumes:
    - ./wekan-db-dump:/dump

wekan-app:
  volumes:
    - ./wekan-attachments:/data/attachments
```

## Migration Steps

1. **Backup SNAP MongoDB**
   ```sh
   mongodump --port 27019 --out ~/backup-wekan
   ```

2. **Restore Backup to Docker Wekan-DB**
   ```sh
   docker exec wekan-db mongorestore --drop --dir=/dump
   ```

3. **Restart Wekan**
   - It forces wekan to run build-in migration scripts.
   ```sh
   docker compose down && docker compose up -d
   ```

4. **Migrate Attachment File Structure**
   ```sh
   mongosh "mongodb://localhost:27017/wekan" --file migrate.js
   ```

5. **Download All Attachments**
   ```sh
   cd downloadAttachments
   npm install
   node main.js
   ```

6. **Move Attachments**
   - Copy everything from `downloadAttachments/attachments` to `./wekan-attachments`.   in my case: `./wekan-attachments`.
