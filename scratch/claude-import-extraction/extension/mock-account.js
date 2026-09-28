/**
 * mock-account.js — a synthetic account, served from inside the extension.
 *
 * The default transport, and the reason a developer-mode load has something to
 * show with no account, no session and no network. It answers the same endpoint
 * shapes the capture asks for, with the same misbehaviours a real account has:
 * paging smaller than asked, a repeated id, a message without a timestamp, an
 * abandoned edit, an attachment-only message.
 *
 * Every conversation here is invented. The names are the prototype's sample
 * people; nothing in this file is a real record.
 */
(function initMockAccount(scope) {
  'use strict';

  const ORGANIZATION_ID = 'org-synthetic-mock-1';
  const ACCOUNT_UUID = 'acct-synthetic-mock-1';

  const CONVERSATIONS = [
    {
      uuid: 'm-1',
      name: 'John Smith weekly notes',
      created_at: '2026-06-30T22:05:00Z',
      updated_at: '2026-07-01T00:02:00Z',
      account: { uuid: ACCOUNT_UUID },
      artifacts: [],
      chat_messages: [
        {
          uuid: 'm-1-1',
          sender: 'human',
          text: 'John Smith tonight. Back to six hours of sleep, and the intrusive thoughts have been daily again for a fortnight.',
          created_at: '2026-06-30T22:05:00Z',
          updated_at: '2026-06-30T22:05:00Z',
          content: [
            {
              type: 'text',
              text: 'John Smith tonight. Back to six hours of sleep, and the intrusive thoughts have been daily again for a fortnight.',
            },
          ],
          files: [],
          attachments: [],
          parent_message_uuid: null,
        },
        {
          uuid: 'm-1-2',
          sender: 'assistant',
          text: 'Subjective: Sleep six hours; intrusive thoughts daily.\n\nPlan: Return to weekly.',
          created_at: '2026-06-30T22:45:00Z',
          updated_at: '2026-06-30T22:45:00Z',
          content: [
            {
              type: 'text',
              text: 'Subjective: Sleep six hours; intrusive thoughts daily.\n\nPlan: Return to weekly.',
            },
          ],
          files: [{ file_name: 'sleep-log-june.pdf', file_size: 48213, file_type: 'application/pdf' }],
          attachments: [],
          parent_message_uuid: 'm-1-1',
        },
        {
          uuid: 'm-1-3',
          sender: 'human',
          text: 'John Smith tonight, editing what I wrote: he has started skipping breakfast, and his sister moved out in May.',
          created_at: '2026-06-30T23:10:00Z',
          updated_at: '2026-06-30T23:10:00Z',
          content: [
            {
              type: 'text',
              text: 'John Smith tonight, editing what I wrote: he has started skipping breakfast, and his sister moved out in May.',
            },
          ],
          files: [],
          attachments: [],
          parent_message_uuid: null,
        },
        {
          uuid: 'm-1-4',
          sender: 'assistant',
          text: 'Subjective: Sleep six hours; intrusive thoughts daily; skipping breakfast; sister moved out in May.\n\nRisk: No risk indicators reported tonight.\n\nPlan: Return to weekly, breakfast as a target.',
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-01T00:02:00Z',
          content: [
            {
              type: 'text',
              text: 'Subjective: Sleep six hours; intrusive thoughts daily; skipping breakfast; sister moved out in May.',
            },
            {
              type: 'tool_use',
              name: 'web_search',
              input: { query: 'intrusive thoughts sleep deprivation' },
            },
            { type: 'tool_result', content: 'three results' },
            {
              type: 'text',
              text: '\nRisk: No risk indicators reported tonight.\n\nPlan: Return to weekly, breakfast as a target.',
            },
          ],
          files: [],
          attachments: [],
          parent_message_uuid: 'm-1-3',
        },
      ],
    },
    {
      uuid: 'm-2',
      name: 'Jane Doe sessions',
      created_at: '2026-07-02T10:00:00Z',
      updated_at: '2026-08-11T11:30:00Z',
      account: { uuid: ACCOUNT_UUID },
      artifacts: [],
      chat_messages: [
        {
          uuid: 'm-2-1',
          sender: 'human',
          text: 'Jane Doe, first of our new weekly sessions. Low mood since the spring, sleeping badly.',
          created_at: '2026-07-02T10:00:00Z',
          updated_at: '2026-07-02T10:00:00Z',
          content: [
            {
              type: 'text',
              text: 'Jane Doe, first of our new weekly sessions. Low mood since the spring, sleeping badly.',
            },
          ],
          files: [],
          attachments: [],
          parent_message_uuid: null,
        },
        {
          uuid: 'm-2-2',
          sender: 'assistant',
          text: 'Subjective: Low mood since spring, disturbed sleep.\n\nPlan: Weekly; monitor sleep and appetite.',
          created_at: '2026-07-02T10:05:00Z',
          updated_at: '2026-07-02T10:05:00Z',
          content: [
            {
              type: 'text',
              text: 'Subjective: Low mood since spring, disturbed sleep.\n\nPlan: Weekly; monitor sleep and appetite.',
            },
          ],
          files: [],
          attachments: [],
          parent_message_uuid: 'm-2-1',
        },
        {
          uuid: 'm-2-3',
          sender: 'human',
          text: 'Jane Doe today. Mood a little better, still waking at three. A message with no timestamp follows.',
          created_at: null,
          updated_at: null,
          content: [
            {
              type: 'text',
              text: 'Jane Doe today. Mood a little better, still waking at three. A message with no timestamp follows.',
            },
          ],
          files: [],
          attachments: [],
          parent_message_uuid: 'm-2-2',
        },
      ],
    },
    {
      uuid: 'm-3',
      name: 'Sourdough timings',
      created_at: '2026-06-18T08:00:00Z',
      updated_at: '2026-07-02T08:10:00Z',
      account: { uuid: ACCOUNT_UUID },
      artifacts: [],
      chat_messages: [
        {
          uuid: 'm-3-1',
          sender: 'human',
          text: 'My sourdough is not rising.',
          created_at: '2026-06-18T08:00:00Z',
          updated_at: '2026-06-18T08:00:00Z',
          content: [{ type: 'text', text: 'My sourdough is not rising.' }],
          files: [],
          attachments: [],
          parent_message_uuid: null,
        },
        {
          uuid: 'm-3-2',
          sender: 'assistant',
          text: 'Cold kitchens slow the starter.',
          created_at: '2026-06-18T08:05:00Z',
          updated_at: '2026-06-18T08:05:00Z',
          content: [{ type: 'text', text: 'Cold kitchens slow the starter.' }],
          files: [],
          attachments: [],
          parent_message_uuid: 'm-3-1',
        },
      ],
    },
    {
      uuid: 'm-4',
      name: 'Scans of the questionnaire',
      created_at: '2026-03-03T12:00:00Z',
      updated_at: '2026-03-03T12:05:00Z',
      account: { uuid: ACCOUNT_UUID },
      artifacts: [],
      chat_messages: [
        {
          uuid: 'm-4-1',
          sender: 'human',
          text: '',
          created_at: '2026-03-03T12:00:00Z',
          updated_at: '2026-03-03T12:00:00Z',
          content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } }],
          files: [{ file_name: 'questionnaire-scan-1.pdf', file_size: 210944, file_type: 'application/pdf' }],
          attachments: [],
          parent_message_uuid: null,
        },
      ],
    },
  ];

  /** What this mock refuses to do, so the refusals are visible in a demo. */
  const MISBEHAVIOUR = {
    pageSize: 2,
    repeatFirstIdOnPage: 2,
    signInPageOnPath: null,
  };

  function listEntry(conversation) {
    return {
      uuid: conversation.uuid,
      name: conversation.name,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      account: { uuid: conversation.account.uuid },
    };
  }

  async function transport(method, path, query) {
    if (path === '/api/organizations') {
      return {
        status: 200,
        json: [{ uuid: ORGANIZATION_ID, name: 'Synthetic practice' }],
        headers: { 'content-type': 'application/json' },
      };
    }
    if (MISBEHAVIOUR.signInPageOnPath !== null && path.indexOf(MISBEHAVIOUR.signInPageOnPath) >= 0) {
      // The failure this prototype exists to catch: a 200 that is a sign-in page.
      return {
        status: 200,
        json: '<!DOCTYPE html><html><body><h1>Sign in to continue</h1></body></html>',
        headers: { 'content-type': 'text/html; charset=utf-8' },
      };
    }
    const list = /^\/api\/organizations\/[^/]+\/chat_conversations$/.exec(path);
    if (list !== null) {
      const limit = Math.max(
        1,
        Math.min(Number(query.limit) || MISBEHAVIOUR.pageSize, MISBEHAVIOUR.pageSize),
      );
      const offset = Number(query.offset) || 0;
      const page = CONVERSATIONS.slice(offset, offset + limit);
      const items = page.map(listEntry);
      const pageIndex = Math.floor(offset / limit) + 1;
      if (pageIndex === MISBEHAVIOUR.repeatFirstIdOnPage && items.length > 0) items.unshift(items[0]);
      return {
        status: 200,
        json: { data: items, has_more: offset + page.length < CONVERSATIONS.length },
        headers: { 'content-type': 'application/json' },
      };
    }
    const detail = /^\/api\/organizations\/[^/]+\/chat_conversations\/([^/]+)$/.exec(path);
    if (detail !== null) {
      const found = CONVERSATIONS.find(function (conversation) {
        return conversation.uuid === detail[1];
      });
      if (found === undefined) return { status: 404, json: null, headers: {} };
      return { status: 200, json: found, headers: { 'content-type': 'application/json' } };
    }
    return { status: 404, json: null, headers: {} };
  }

  scope.ApuntaMockAccount = {
    ORGANIZATION_ID: ORGANIZATION_ID,
    ACCOUNT_UUID: ACCOUNT_UUID,
    CONVERSATIONS: CONVERSATIONS,
    MISBEHAVIOUR: MISBEHAVIOUR,
    transport: transport,
  };
})(typeof globalThis === 'undefined' ? this : globalThis);
