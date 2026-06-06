export function readBlobAsDataUrl(blob: Blob, errorMessage = 'Could not read media.'): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error ?? new Error(errorMessage));
        reader.readAsDataURL(blob);
    });
}
