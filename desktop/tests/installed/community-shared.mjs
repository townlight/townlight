import assert from 'node:assert/strict';

function unwrapResult(value) {
  return value && typeof value === 'object' && 'result' in value ? value.result : value;
}

async function call(native, command, request) {
  assert.equal(typeof native, 'function', `Native function missing for ${command}`);
  return unwrapResult(await native(command, { request }));
}

function shaValue(value) {
  for (const key of ['revision_sha', 'revisionSha', 'content_sha', 'sha256', 'sha']) {
    if (typeof value?.[key] === 'string' && value[key].length > 0) return value[key];
  }
  return undefined;
}

export async function communityShared({
  hostNative,
  guestNative,
  ids,
  save,
  hostMachine,
  guestMachine,
  machineAcceptanceRef,
}) {
  assert.equal(typeof save, 'function', 'save must be a function');
  assert.ok(ids && typeof ids === 'object', 'ids is required');
  assert.ok(typeof hostMachine === 'string' && hostMachine.trim().length > 0, 'hostMachine required');
  assert.ok(typeof guestMachine === 'string' && guestMachine.trim().length > 0, 'guestMachine required');
  assert.notEqual(hostMachine, guestMachine, 'host and guest machines must be distinct');
  assert.ok(
    typeof machineAcceptanceRef === 'string' && machineAcceptanceRef.trim().length > 0,
    'machineAcceptanceRef required',
  );

  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const uniqueComment = `Shared workstation acceptance comment ${nonce}`;
  const uniqueTitle = `Shared workstation acceptance announcement ${nonce}`;

  assert.ok(ids.serviceRequest, 'ids.serviceRequest required');
  assert.ok(ids.parksResource, 'ids.parksResource required');
  assert.ok(ids.parksHousehold, 'ids.parksHousehold required');
  assert.ok(ids.parksFinanceRecords, 'ids.parksFinanceRecords required');

  const serviceRead = await call(hostNative, 'service_requests_request', {
    operation: 'request',
    id: ids.serviceRequest,
  });
  const service = serviceRead?.request ?? serviceRead;
  assert.ok(service, 'service request response required');
  assert.equal(String(service.id), String(ids.serviceRequest), 'service request id mismatch');
  assert.notEqual(service.revision, undefined, 'service request revision required');

  await call(guestNative, 'service_requests_request', {
    operation: 'comment',
    id: ids.serviceRequest,
    payload: {
      expected_revision: service.revision,
      message: uniqueComment,
      public: true,
    },
  });

  const serviceReread = await call(hostNative, 'service_requests_request', {
    operation: 'request',
    id: ids.serviceRequest,
  });
  const serviceAfter = serviceReread?.request ?? serviceReread;
  assert.ok(serviceAfter, 'service request reread required');
  const eventsJson = JSON.stringify(serviceAfter.events ?? serviceAfter.service_events ?? serviceAfter);
  assert.ok(eventsJson.includes(uniqueComment), 'guest comment not visible in events JSON');
  assert.ok(
    Number(serviceAfter.revision) > Number(service.revision),
    'service request revision did not increase after comment',
  );

  const communications = await call(guestNative, 'communications_request', {
    operation: 'create',
    payload: {
      title: uniqueTitle,
      body: 'Shared workstation acceptance',
      kind: 'announcement',
      language: 'en',
      sources: [],
      access_reviewed: true,
    },
  });
  const createdArticle = communications.article ?? communications;
  assert.ok(createdArticle, 'communications create response required');
  const articleId = createdArticle.id ?? createdArticle.article_id;
  assert.ok(articleId, 'communications article id required');

  const articleRead = await call(hostNative, 'article', {
    operation: 'article',
    id: articleId,
  });
  const article = articleRead.article ?? articleRead;
  assert.ok(article, 'article response required');
  assert.equal(String(article.id ?? article.article_id), String(articleId), 'article id mismatch');
  assert.equal(article.title, uniqueTitle, 'article title mismatch');
  const createdSha = shaValue(createdArticle);
  const readSha = shaValue(article);
  if (createdSha && readSha) assert.equal(readSha, createdSha, 'article revision SHA mismatch');
  else if (readSha) assert.ok(readSha.length > 0, 'article revision SHA must be nonempty');

  const catalog = await call(guestNative, 'catalog-get', {
    kind: 'resource',
    id: ids.parksResource,
  });
  const resource = catalog.entry ?? catalog.resource ?? catalog;
  assert.ok(resource, 'parks resource response required');
  assert.notEqual(resource.revision, undefined, 'parks resource revision required');

  const startsAt = new Date(Date.now() + 50 * 24 * 60 * 60 * 1000);
  startsAt.setUTCHours(10, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

  const bookingCreate = await call(guestNative, 'bookings-create', {
    payload: {
      resource_id: ids.parksResource,
      household_id: ids.parksHousehold,
      expected_resource_revision: resource.revision,
      occurrences: [
        {
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        },
      ],
      purpose: 'Shared workstation acceptance',
    },
  });
  assert.ok(Array.isArray(bookingCreate.bookings), 'bookings-create must return bookings array');
  const createdBooking = bookingCreate.bookings[0];
  assert.ok(createdBooking?.id, 'created booking id required');

  const bookingRead = await call(hostNative, 'bookings-get', {
    booking_id: createdBooking.id,
  });
  const fetchedBooking = bookingRead.booking ?? bookingRead;
  assert.ok(fetchedBooking, 'bookings-get response required');
  assert.equal(
    String(fetchedBooking.household_id),
    String(ids.parksHousehold),
    'booking household_id mismatch',
  );
  assert.notEqual(fetchedBooking.revision, undefined, 'booking revision required');

  const transition = await call(guestNative, 'bookings-transition', {
    booking_id: createdBooking.id,
    payload: {
      expected_revision: createdBooking.revision ?? fetchedBooking.revision,
      state: 'cancelled',
      reason: 'Acceptance cleanup',
    },
  });
  assert.ok(transition, 'bookings-transition response required');

  const bookingAfterRead = await call(hostNative, 'bookings-get', {
    booking_id: createdBooking.id,
  });
  const bookingAfter = bookingAfterRead.booking ?? bookingAfterRead;
  assert.ok(bookingAfter, 'booking readback required');
  assert.ok('status' in bookingAfter || 'state' in bookingAfter, 'booking status/state required');
  if ('status' in bookingAfter) {
    assert.equal(String(bookingAfter.status).toLowerCase(), 'cancelled', 'booking status not cancelled');
  }
  if ('state' in bookingAfter) {
    assert.equal(String(bookingAfter.state).toLowerCase(), 'cancelled', 'booking state not cancelled');
  }

  try {
    const recordsResult = await call(guestNative, 'records_domain_request', {
      operation: 'view',
      request_id: ids.parksFinanceRecords,
    });
    assert.match(
      JSON.stringify(recordsResult),
      /403|forbidden|not authorized|permission/i,
      'Records request unexpectedly succeeded',
    );
  } catch (error) {
    assert.match(
      String(error?.message ?? error),
      /403|forbidden|not authorized|permission/i,
      'Records request was not actually rejected',
    );
  }

  await save({
    publicIDs: {
      serviceRequest: ids.serviceRequest,
      article: articleId,
      booking: createdBooking.id,
      parksResource: ids.parksResource,
      parksHousehold: ids.parksHousehold,
    },
    revisions: {
      serviceRequest: serviceAfter.revision,
      article: article.revision ?? createdArticle.revision ?? null,
      parksResource: resource.revision,
      booking: bookingAfter.revision ?? fetchedBooking.revision ?? createdBooking.revision ?? null,
    },
    machines: {
      host: hostMachine,
      guest: guestMachine,
      acceptanceRef: machineAcceptanceRef,
    },
  });

  return { passed: true };
}
