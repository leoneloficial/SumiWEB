const config = {
    nombrebot: 'sumi sakurasawa',
    moneda: 'Yenes',
    apikey: 'LeonelKeyrqla8441', 
    prefijo: '.',

    owner: [
 '393715279301@lid',     '393715279301@s.whatsapp.net',        '393715279301@s.whatsapp.net'
    ],

    restrict: false
};

try {
    if (!globalThis.nombrebot) globalThis.nombrebot = config.nombrebot;
    if (!globalThis.moneda) globalThis.moneda = config.moneda;
    if (!globalThis.prefijo) globalThis.prefijo = config.prefijo;
    if (!globalThis.apikey) globalThis.apikey = config.apikey;
} catch {}

export default config;