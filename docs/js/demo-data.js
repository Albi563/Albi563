// Famiglia di esempio (inventata) usata solo in modalità demo.
const P = {
  torino: { name: 'Torino, Italia', lat: 45.0703, lng: 7.6869 },
  milano: { name: 'Milano, Italia', lat: 45.4642, lng: 9.19 },
  napoli: { name: 'Napoli, Italia', lat: 40.8518, lng: 14.2681 },
  bari: { name: 'Bari, Italia', lat: 41.1171, lng: 16.8719 },
  iasi: { name: 'Iași, România', lat: 47.1585, lng: 27.6014 },
  bucuresti: { name: 'București, România', lat: 44.4268, lng: 26.1025 },
  suceava: { name: 'Suceava, România', lat: 47.6514, lng: 26.2556 },
  madrid: { name: 'Madrid, España', lat: 40.4168, lng: -3.7038 },
  londra: { name: 'London, United Kingdom', lat: 51.5072, lng: -0.1276 },
};

export function demoPeople() {
  const by = { id: 'p_marco', name: 'Marco Rinaldi' };
  const ts = Date.now() - 86400000 * 3;
  const mk = (id, firstName, lastName, sex, birth, extra = {}) => ({
    id, firstName, lastName, sex, birth, alive: true, death: null, birthPlace: null, residence: null,
    notes: '', photo: null, parents: [], partnerId: null,
    createdAt: ts, createdBy: by, updatedAt: ts, updatedBy: by, ...extra,
  });
  return [
    // Bisnonni
    mk('p_giuseppe', 'Giuseppe', 'Rinaldi', 'M', { y: 1905 }, { alive: false, death: { y: 1971 }, birthPlace: P.bari, residence: P.bari, partnerId: 'p_concetta', notes: 'Pescatore. Si diceva cantasse alle feste del paese.' }),
    mk('p_concetta', 'Concetta', 'Lorusso', 'F', { y: 1910 }, { alive: false, death: { y: 1988 }, birthPlace: P.bari, residence: P.bari, partnerId: 'p_giuseppe' }),
    // Nonni paterni
    mk('p_antonio', 'Antonio', 'Rinaldi', 'M', { y: 1934, m: 3, d: 12 }, { alive: false, death: { y: 2009, m: 11 }, birthPlace: P.bari, residence: P.torino, parents: ['p_giuseppe', 'p_concetta'], partnerId: 'p_lucia', notes: 'Emigrato a Torino nel 1958, operaio in fabbrica.' }),
    mk('p_lucia', 'Lucia', 'Esposito', 'F', { y: 1938 }, { birthPlace: P.napoli, residence: P.torino, partnerId: 'p_antonio' }),
    mk('p_rosa', 'Rosa', 'Rinaldi', 'F', { y: 1937 }, { alive: false, death: { y: 2015 }, birthPlace: P.bari, residence: P.bari, parents: ['p_giuseppe', 'p_concetta'] }),
    // Nonni materni
    mk('p_ion', 'Ion', 'Popescu', 'M', { y: 1940 }, { alive: false, death: { y: 2012 }, birthPlace: P.suceava, residence: P.iasi, partnerId: 'p_elena' }),
    mk('p_elena', 'Elena', 'Popescu', 'F', { y: 1944, m: 5, d: 21 }, { birthPlace: P.suceava, residence: P.iasi, partnerId: 'p_ion' }),
    // Genitori e zii
    mk('p_paolo', 'Paolo', 'Rinaldi', 'M', { y: 1962 }, { birthPlace: P.torino, residence: P.torino, parents: ['p_antonio', 'p_lucia'], partnerId: 'p_ana' }),
    mk('p_ana', 'Ana', 'Popescu', 'F', { y: 1966 }, { birthPlace: P.iasi, residence: P.torino, parents: ['p_ion', 'p_elena'], partnerId: 'p_paolo' }),
    mk('p_franco', 'Franco', 'Rinaldi', 'M', { y: 1965 }, { birthPlace: P.torino, residence: P.milano, parents: ['p_antonio', 'p_lucia'], partnerId: 'p_carmen' }),
    mk('p_carmen', 'Carmen', 'García', 'F', { y: 1968 }, { birthPlace: P.madrid, residence: P.milano, partnerId: 'p_franco' }),
    mk('p_mihai', 'Mihai', 'Popescu', 'M', { y: 1970 }, { birthPlace: P.iasi, residence: P.bucuresti, parents: ['p_ion', 'p_elena'] }),
    // Generazione "io"
    mk('p_marco', 'Marco', 'Rinaldi', 'M', { y: 1992, m: 7, d: 4 }, { birthPlace: P.torino, residence: P.torino, parents: ['p_paolo', 'p_ana'], partnerId: 'p_giulia' }),
    mk('p_giulia', 'Giulia', 'Ferraro', 'F', { y: 1994 }, { birthPlace: P.milano, residence: P.torino, partnerId: 'p_marco' }),
    mk('p_sara', 'Sara', 'Rinaldi', 'F', { y: 1996 }, { birthPlace: P.torino, residence: P.londra, parents: ['p_paolo', 'p_ana'] }),
    mk('p_luis', 'Luis', 'Rinaldi García', 'M', { y: 1998 }, { birthPlace: P.milano, residence: P.madrid, parents: ['p_franco', 'p_carmen'] }),
    mk('p_andrei', 'Andrei', 'Popescu', 'M', { y: 2001 }, { birthPlace: P.bucuresti, residence: P.bucuresti, parents: ['p_mihai'] }),
    // Figli
    mk('p_leo', 'Leo', 'Rinaldi', 'M', { y: 2023, m: 2 }, { birthPlace: P.torino, residence: P.torino, parents: ['p_marco', 'p_giulia'] }),
  ];
}
