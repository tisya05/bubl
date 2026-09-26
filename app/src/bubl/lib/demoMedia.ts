// Browser storage only. This does not upload files or create a server endpoint.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bubl-demo-media', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('files')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Your browser could not store this file.'))
  })
}
export async function saveDemoMedia(id: string, file: Blob) {
  const db = await database()
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite')
    transaction.objectStore('files').put(file, id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = transaction.onabort = () => reject(new Error('Not enough browser storage for this file.'))
  }) } finally { db.close() }
}
export async function readDemoMedia(id: string): Promise<Blob | undefined> {
  const db = await database()
  try { return await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction('files', 'readonly').objectStore('files').get(id)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Could not reopen this file.'))
  }) } finally { db.close() }
}
