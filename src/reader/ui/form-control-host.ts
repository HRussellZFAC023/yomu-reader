// Marks a host whose closed shadow root holds a form control (the "Add to deck…"
// dropdown). Keys typed into it reach the page retargeted to the host, and the composed
// path seen outside stops there, so shortcut gates match this attribute instead.
export const FORM_CONTROL_HOST_ATTRIBUTE = 'data-yomu-form-control-host';
