import { id } from './util.mjs';
export async function seedDemo(service) {
  if (
    service.c.mode !== 'demo' ||
    !service.c.seedDemo ||
    service.s.get('SELECT id FROM leads LIMIT 1')
  )
    return;
  if ([service.llm.name, service.calendar.name, service.email.name].some((x) => x !== 'mock'))
    return;
  const fixtures = [
    [
      'Olivia Brooks',
      'roofing',
      'Roofing in Demo City A, budget $25,000 to $35,000. I own the home and want to start within 2 months.'
    ],
    [
      'James Wilson',
      'extensions',
      'An extension in Demo City B. My budget is $45,000 and I own this home. Starting in 3 months.'
    ],
    [
      'Emma Chen',
      'pool installation',
      'Pool installation in Demo City A, budget $18,000. Can a human call me to discuss the project?'
    ],
    [
      'Noah Williams',
      'concrete works',
      'Concrete works in Demo City B. Budget $12,000. I own the property and want to start in 5 months.'
    ],
    ['Ava Thompson', 'roofing', 'Roofing in Demo City A.'],
    ['Liam Carter', 'extensions', 'Extensions, located in Outside City, budget $60,000.'],
    [
      'Sophia Martin',
      'roofing',
      'Roofing in Demo City B. Budget $35,000. I am the homeowner and would like to start in 1 month.'
    ],
    ['Lucas Davis', 'concrete works', null]
  ];
  for (let i = 0; i < fixtures.length; i++) {
    const [name, serviceType, reply] = fixtures[i];
    const r = service.intake(
      {
        event_key: `seed-${i}`,
        name,
        email: `demo.${i + 1}@example.test`,
        service_type: serviceType
      },
      { web: true }
    );
    if (reply) {
      service.postMessage(r.leadId, reply, id());
      await service.tick();
    }
    if (i === 6) {
      const l = service.lead(r.leadId);
      if (l.qualification === 'complete') {
        const slots = await service.availability(l.id);
        if (slots.slots.length) {
          service.book(l.id, slots.slots[0].id, 'seed-booking');
          await service.tick();
        }
      }
    }
  }
  service.s.audit(
    null,
    'demo_seeded',
    { count: fixtures.length, synthetic: true },
    'system',
    undefined,
    service.clock()
  );
}
