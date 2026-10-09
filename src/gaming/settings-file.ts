import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Saves small settings files from the main process whole and in the order they were
 * made. Each save goes to a sibling file that then replaces the saved one, so a reader,
 * or a crash mid-save, never meets a truncated file; and a slow earlier save cannot
 * finish after a later one and put back an older value.
 */
export function settingsFileWriter(): (filePath: string, text: string) => Promise<void> {
    let queue: Promise<void> = Promise.resolve();
    return (filePath, text) => {
        const save = queue.then(async () => {
            const staging = `${filePath}.saving`;
            await mkdir(path.dirname(filePath), { recursive: true });
            await writeFile(staging, text, 'utf8');
            await rename(staging, filePath);
        });
        queue = save.catch(() => undefined);
        return save;
    };
}
