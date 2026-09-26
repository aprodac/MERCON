import { exportDrivers } from './controllers/driverController';

const runTest = async () => {
  const req: any = {
    query: { format: 'csv', licenseFilter: 'Expired' }
  };
  
  let outStr = '';
  const res: any = {
    setHeader: () => {},
    write: (chunk: any) => { outStr += chunk.toString(); },
    end: () => { console.log('CSV OUTPUT:\n', outStr.slice(0, 500)); },
    status: (code: any) => ({ json: (d: any) => console.log('ERROR:', code, d) })
  };

  await exportDrivers(req, res);
};

runTest();
