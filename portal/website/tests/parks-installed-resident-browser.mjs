import { pathToFileURL } from 'node:url';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

try {
  const input = await readStdin();
  const { installedResidentParks } = await import(pathToFileURL(input.helper).href);
  const result = await installedResidentParks({
    portalBaseUrl: input.base,
    resourceId: input.resource,
    sessionId: input.session,
    native: async (_cmd, { request }) => {
      const kind = request.operation === 'bookings-get' ? 'booking' : 'registration';
      const id = request.booking_id || request.registration_id;
      const r = await fetch(input.control + '/' + kind + '/' + id);
      if (!r.ok) throw Error('Native read failed');
      return r.json();
    },
    save: async () => {},
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}