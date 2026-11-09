// ==RECIPES START==
// Formato igual à ficha "Mixing Process": matriz de até 12 passos.
// fw: 'up' | 'middle' | 'down' | 'press'. cond 'A' = o primeiro critério atingido encerra o passo; 'B' = todos os critérios.
const EMPTY_STEP = () => ({ fw: '', airBlow: false, airCharge: false, hopper: false, carbon: false, oil: false, rpm: 0, time: 0, temp: 0, pi: 0, rot: 0, cond: 'A' });
function mkSteps(list) { const a = list.map(x => Object.assign(EMPTY_STEP(), x)); while (a.length < 12) a.push(EMPTY_STEP()); return a; }
const DEFAULT_RECIPES = [
  {
    id: 's337y', compound: 'S337Y', klass: 'S', mixDiv: 'A', hqNo: '2', wtNo: '17', slitter: 4, thickness: 8.0, limitDay: 30,
    approve: '', check: '', make: '',
    ingredients: [{ code: '', name: 'S337X', tipo: 'mb', kg: 305, tol: 1 }],
    carbon: [{ no: 4, kind: 'N220*ISAF*', kg: 17.4, step: 1 }],
    oil: [],
    steps: mkSteps([
      { fw: 'up', carbon: true, rpm: 42, time: 5 },
      { fw: 'down', rpm: 42, time: 45 },
      { fw: 'up', airBlow: true, rpm: 25, time: 12 },
      { fw: 'down', rpm: 25, time: 40, temp: 150 },
    ]),
    jog: 200, jog2: '', cut: '', ddTime: 10, ddRpm: 25,
    tcu: { casing: 35, rotor: 40, door: 45 }, guardMax: 180, guardMin: 140,
  },
  {
    id: 'mb-exemplo', compound: 'MB-EXEMPLO', klass: 'M', mixDiv: 'A', hqNo: '1', wtNo: '1', slitter: 4, thickness: 8.0, limitDay: 30,
    approve: '', check: '', make: '',
    ingredients: [{ code: '', name: 'NR/SBR', tipo: 'polimero', kg: 190, tol: 1 }, { code: '', name: 'Químicos (ZnO, ácido esteárico, AO)', tipo: 'quimicos', kg: 14, tol: 0.2 }],
    carbon: [{ no: 1, kind: 'N234', kg: 63, step: 2 }, { no: 1, kind: 'N234', kg: 32, step: 4 }],
    oil: [{ no: 1, kind: 'Óleo TDAE', kg: 14, step: 4 }],
    steps: mkSteps([
      { fw: 'down', rpm: 40, time: 30 },
      { fw: 'up', carbon: true, rpm: 40, time: 5 },
      { fw: 'down', rpm: 50, time: 90, temp: 115 },
      { fw: 'up', carbon: true, oil: true, rpm: 40, time: 5 },
      { fw: 'down', rpm: 50, time: 120, temp: 138 },
      { fw: 'up', airBlow: true, rpm: 40, time: 8 },
      { fw: 'down', rpm: 50, time: 150, temp: 158 },
    ]),
    jog: 200, jog2: '', cut: '', ddTime: 10, ddRpm: 30,
    tcu: { casing: 35, rotor: 40, door: 45 }, guardMax: 175, guardMin: 145,
  },
  {
    id: 'final-exemplo', compound: 'FINAL-EXEMPLO', klass: 'F', mixDiv: 'A', hqNo: '1', wtNo: '2', slitter: 4, thickness: 8.0, limitDay: 15,
    approve: '', check: '', make: '',
    ingredients: [{ code: '', name: 'Masterbatch', tipo: 'mb', kg: 305, tol: 1 }, { code: '', name: 'Enxofre + acelerador', tipo: 'curativos', kg: 7, tol: 0.05 }],
    carbon: [], oil: [],
    steps: mkSteps([
      { fw: 'down', rpm: 25, time: 40 },
      { fw: 'up', airBlow: true, rpm: 20, time: 6 },
      { fw: 'down', rpm: 25, time: 60, temp: 104 },
    ]),
    jog: 200, jog2: '', cut: '', ddTime: 10, ddRpm: 20,
    tcu: { casing: 30, rotor: 35, door: 40 }, guardMax: 115, guardMin: 95,
  },
];
// ==RECIPES END==
if (typeof module !== 'undefined') module.exports = { DEFAULT_RECIPES };
