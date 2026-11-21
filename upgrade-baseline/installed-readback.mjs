  if (mode === 'seed' || mode === 'upgrade') {
    const {createHash} = await import('node:crypto');
    const sha256 = value => createHash('sha256').update(value).digest('hex');
    const records = request => native('records_domain_request', {request});
    const attachmentHash = async requestId => {
      const request = await records({operation:'view', request_id:requestId});
      const attachment = request.documents.find(item => item.title === 'Upgrade retention fixture');
      assert(attachment?.stored_path, 'Managed Records attachment is missing');
      return sha256(await readFile(attachment.stored_path));
    };
    if (mode === 'seed') {
      if ((await native('get_app_state')).domain_authority !== 'python-records') {
        accepted(await native('supervisor_action', {action:'activate-records', serviceId:null}));
        await admin();
      }
      const fixturePath = path.join(output, 'records-attachment.txt');
      const fixtureBytes = 'Fictional city public-records attachment for upgrade acceptance\n';
      await writeFile(fixturePath, fixtureBytes);
      const request = await records({operation:'create', payload:{
        requester:'Fictional city fixture', summary:'Upgrade retention check',
        deadline:'2026-12-20', deadlineBasis:'Fictional staff-reviewed fixture',
      }});
      await records({operation:'attach-document', request_id:request.id,
        title:'Upgrade retention fixture', source_path:fixturePath, citation:'Synthetic acceptance'});
      const hash = await attachmentHash(request.id);
      assert.equal(hash, sha256(fixtureBytes));
      await save('upgrade-fixture', {request_id:request.id, sha256:hash});
    } else {
      const fixture = JSON.parse(await readFile(path.join(output, 'upgrade-fixture.json'), 'utf8'));
      const readback = async () => {
        const meeting = await native('meetings_domain_request', {
          request:{operation:'get-meeting', id:ids.meeting_id},
        });
        assert.equal(meeting.id, ids.meeting_id);
        assert.equal(await attachmentHash(fixture.request_id), fixture.sha256);
      };
      await readback();
      const station = action => native('station_action', {action, selectedDirectory:null});
      const initialStation = await station('status');
      if (!initialStation.ready) await station('setup');
      const finalStation = await station('status');
      assert.equal(finalStation.ready, true);
      accepted(await native('supervisor_action', {action:'backup', serviceId:null}));
      const restore = await native('supervisor_action', {action:'restore', serviceId:null});
      assert.equal(restore.action, 'restore');
      if (!restore.accepted) assert.equal(restore.status, 'Restore needs service start');
      accepted(await native('supervisor_action', {action:'start', serviceId:null}));
      await admin();
      await readback();
      await save('upgrade-retention-and-recovery', {
        passed:true, meeting_id:ids.meeting_id, ...fixture, initialStation, finalStation,
        restore_status:restore.status,
      });
    }
  }
