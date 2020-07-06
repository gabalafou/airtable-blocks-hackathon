export default Boolean(
    window &&
    window.location &&
    window.location.hostname &&
    window.location.hostname.indexOf('devblock') > -1
);
