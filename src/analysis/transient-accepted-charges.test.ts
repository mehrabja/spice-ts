import { describe, expect, it } from 'vitest';
import { createTransientSim } from './transient-driver.js';

const CASES = [
  {
    family: 'BJT',
    deviceName: 'Q1',
    branchIds: ['qBE', 'qBC', 'qSUB', 'qBX'],
    netlist: `BJT accepted-charge snapshot
VCC c 0 DC 2
VBE b 0 PULSE(0.62 0.72 0 0.1n 0.1n 2n 4n)
Q1 c b 0 QMOD
.model QMOD NPN(IS=1e-15 BF=100 CJE=2p CJC=1p CJS=0.5p)
.tran 0.1n 5n
.end`,
  },
  {
    family: 'MOS1',
    deviceName: 'M1',
    branchIds: ['qGD', 'qGS', 'qGB', 'qBD', 'qBS'],
    netlist: `MOS1 accepted-charge snapshot
VD d 0 DC 1
VG g 0 PULSE(0 1 0 0.1n 0.1n 2n 4n)
M1 d g 0 0 NMOD
.model NMOD NMOS(LEVEL=1 VTO=0.4 KP=1m CGSO=2p CGDO=1p CGBO=0.5p CBD=0.5p CBS=0.5p PB=0.8 MJ=0.5)
.tran 0.1n 5n
.end`,
  },
  {
    family: 'JFET',
    deviceName: 'J1',
    branchIds: ['qGD', 'qGS'],
    netlist: `JFET accepted-charge snapshot
V1 in 0 PULSE(-4 0.4 0 1n 1n 20n 50n)
R1 in g 1k
VD d 0 2
J1 d g 0 JM
.model JM NJF VTO=-2 BETA=1m CGS=2p CGD=1p PB=0.8 FC=0.5
.tran 0.1n 5n
.end`,
  },
] as const;

describe('TransientSim accepted nonlinear charge snapshots', () => {
  it.each(CASES)('reports detached accepted $family charge branches', async ({ deviceName, branchIds, netlist }) => {
    const sim = await createTransientSim(netlist);
    try {
      const initial = sim.snapshotAcceptedCharges();
      expect(initial.time).toBe(sim.simTime);
      expect(initial.time).toBe(0);
      expect(initial.unreportedDeviceNames).toEqual([]);
      expect(initial.devices).toHaveLength(1);
      const initialDevice = initial.devices[0]!;
      expect(initialDevice.deviceName).toBe(deviceName);
      expect(initialDevice.branches.map(branch => branch.branchId)).toEqual(branchIds);
      expect(initialDevice.branches.every(branch => Number.isFinite(branch.chargeC))).toBe(true);
      expect(Object.isFrozen(initial)).toBe(true);
      expect(Object.isFrozen(initial.devices)).toBe(true);
      expect(Object.isFrozen(initialDevice)).toBe(true);
      expect(Object.isFrozen(initialDevice.branches)).toBe(true);
      expect(initialDevice.branches.every(branch => Object.isFrozen(branch))).toBe(true);

      const firstCharge = initialDevice.branches[0]!.chargeC;
      const acceptedStep = sim.advance();
      const next = sim.snapshotAcceptedCharges();
      expect(next.time).toBe(acceptedStep.time);
      expect(next.time).toBeGreaterThan(initial.time);
      expect(next.devices[0]!.branches).not.toBe(initialDevice.branches);
      // A later accepted step cannot mutate a previously returned snapshot.
      expect(initialDevice.branches[0]!.chargeC).toBe(firstCharge);
    } finally {
      sim.dispose();
    }
  });

  it('reports the stable MOS1 branch layout when all stored-charge parameters are zero', async () => {
    const sim = await createTransientSim(`MOS1 without charge storage
VD d 0 DC 1
VG g 0 DC 0
M1 d g 0 0 NMOD
.model NMOD NMOS(LEVEL=1 VTO=0.4 KP=1m)
.tran 0.1n 1n
.end`);
    try {
      const snapshot = sim.snapshotAcceptedCharges();
      expect(snapshot.time).toBe(0);
      expect(snapshot.unreportedDeviceNames).toEqual([]);
      expect(snapshot.devices).toHaveLength(1);
      expect(snapshot.devices[0]!.deviceName).toBe('M1');
      expect(snapshot.devices[0]!.branches.map(branch => branch.branchId)).toEqual([
        'qGD', 'qGS', 'qGB', 'qBD', 'qBS',
      ]);
      expect(snapshot.devices[0]!.branches.every(branch => branch.chargeC === 0)).toBe(true);
    } finally {
      sim.dispose();
    }
  });

  it('reports charge-integrating devices without a snapshot hook', async () => {
    const sim = await createTransientSim(`unreported nonlinear charge device
V1 in 0 PULSE(0 1 0 1n 1n 2n 4n)
R1 in out 1k
D1 out 0 DMOD
.model DMOD D(IS=1e-14 CJO=1p)
.tran 0.1n 5n
.end`);
    try {
      expect(sim.snapshotAcceptedCharges()).toMatchObject({
        time: 0,
        devices: [],
        unreportedDeviceNames: ['D1'],
      });
    } finally {
      sim.dispose();
    }
  });
});

