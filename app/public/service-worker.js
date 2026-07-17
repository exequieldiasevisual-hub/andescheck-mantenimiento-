// ponytail: no-op fetch handler — solo existe para que Chrome considere la app
// "instalable" (icono real + modo pantalla completa). Si más adelante hace
// falta que funcione offline de verdad, acá se agrega el cacheo.
self.addEventListener('fetch', () => {})
