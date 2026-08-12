/**
 * Opens a user-gesture file picker without ever exposing the input to the host
 * page. Files are copied before listeners and the last input reference clear.
 */
export function openDetachedFilePicker(accept: string, onFiles: (files: File[]) => void): void {
    let input: HTMLInputElement | undefined = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    const clear = (): void => {
        const picker = input;
        input = undefined;
        if (!picker) return;
        picker.removeEventListener('change', changed);
        picker.removeEventListener('cancel', clear);
        picker.value = '';
    };
    const changed = (): void => {
        const files = Array.from(input?.files ?? []);
        clear();
        if (files.length) onFiles(files);
    };
    input.addEventListener('change', changed, { once: true });
    input.addEventListener('cancel', clear, { once: true });
    input.click();
}
