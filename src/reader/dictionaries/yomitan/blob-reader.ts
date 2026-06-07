export function readBlobWithFileReader<T>(
    blob: Blob,
    read: (reader: FileReader, blob: Blob) => void,
    result: (reader: FileReader) => T,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
        reader.onload = () => resolve(result(reader));
        read(reader, blob);
    });
}
