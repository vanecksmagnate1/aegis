import { verifyAdminToken } from './_lib/adminToken.js';
import { sbInsert, sbDelete, sbUpdate, sbSelect, sbCount } from './_lib/supabaseRest.js';

const LOCKED_ROOM = 'Sala General';

async function notice(room, text) {
  await sbInsert('chat_messages', {
    room: room || LOCKED_ROOM,
    nick: 'Sistema',
    color: '#000000',
    role: 'admin',
    kind: 'system',
    body: JSON.stringify({ type: 'notice', text }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  const { token, action, payload } = req.body || {};
  if (!verifyAdminToken(token)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  try {
    switch (action) {
      case 'ban': {
        const nick = String(payload?.nick || '').trim();
        if (!nick) throw new Error('missing_nick');
        await sbInsert('chat_bans', { nick_lower: nick.toLowerCase(), nick, banned_by: 'Admin' });
        await sbInsert('chat_messages', {
          room: payload?.room || LOCKED_ROOM,
          nick: 'Sistema',
          color: '#000000',
          role: 'admin',
          kind: 'system',
          body: JSON.stringify({ type: 'kick', nick, reason: payload?.reason || '' }),
        });
        break;
      }
      case 'unban': {
        const nick = String(payload?.nick || '').trim();
        await sbDelete('chat_bans', 'nick_lower', nick.toLowerCase());
        break;
      }
      case 'mute': {
        const nick = String(payload?.nick || '').trim();
        await sbInsert('chat_mutes', { nick_lower: nick.toLowerCase(), nick, muted_by: 'Admin' });
        await notice(payload?.room, `${nick} fue muteado por Admin.`);
        break;
      }
      case 'unmute': {
        const nick = String(payload?.nick || '').trim();
        await sbDelete('chat_mutes', 'nick_lower', nick.toLowerCase());
        await notice(payload?.room, `${nick} ya puede escribir de nuevo.`);
        break;
      }
      case 'promote': {
        const nick = String(payload?.nick || '').trim();
        await sbInsert('chat_moderators', { nick_lower: nick.toLowerCase(), nick, promoted_by: 'Admin' });
        await notice(payload?.room, `${nick} fue ascendido a moderador.`);
        break;
      }
      case 'demote': {
        const nick = String(payload?.nick || '').trim();
        await sbDelete('chat_moderators', 'nick_lower', nick.toLowerCase());
        await notice(payload?.room, `${nick} ya no es moderador.`);
        break;
      }
      case 'addRoom': {
        const name = String(payload?.name || '').trim();
        if (!name) throw new Error('missing_name');
        const existing = await sbSelect('chat_rooms', `name=eq.${encodeURIComponent(name)}&select=name`);
        if (existing.length) throw new Error('room_exists');
        const count = await sbCount('chat_rooms');
        await sbInsert('chat_rooms', { name, sort_order: count });
        break;
      }
      case 'renameRoom': {
        const oldName = String(payload?.oldName || '').trim();
        const newName = String(payload?.newName || '').trim();
        if (oldName === LOCKED_ROOM) throw new Error('locked_room');
        if (!newName) throw new Error('missing_name');
        await sbUpdate('chat_rooms', 'name', oldName, { name: newName });
        break;
      }
      case 'deleteRoom': {
        const name = String(payload?.name || '').trim();
        if (name === LOCKED_ROOM) throw new Error('locked_room');
        await sbUpdate('chat_messages', 'room', name, { room: LOCKED_ROOM });
        await sbDelete('chat_rooms', 'name', name);
        break;
      }
      case 'kick': {
        const nick = String(payload?.nick || '').trim();
        const room = String(payload?.room || LOCKED_ROOM);
        await sbInsert('chat_messages', {
          room,
          nick: 'Sistema',
          color: '#000000',
          role: 'admin',
          kind: 'system',
          body: JSON.stringify({ type: 'kick', nick, reason: payload?.reason || '' }),
        });
        break;
      }
      case 'move': {
        const nick = String(payload?.nick || '').trim();
        const targetRoom = String(payload?.targetRoom || '').trim();
        const room = String(payload?.room || LOCKED_ROOM);
        if (!nick || !targetRoom) throw new Error('missing_fields');
        await sbInsert('chat_messages', {
          room,
          nick: 'Sistema',
          color: '#000000',
          role: 'admin',
          kind: 'system',
          body: JSON.stringify({ type: 'move', nick, targetRoom }),
        });
        break;
      }
      case 'forceProfile': {
        const nick = String(payload?.nick || '').trim();
        const room = String(payload?.room || LOCKED_ROOM);
        if (!nick) throw new Error('missing_nick');
        const newNick = String(payload?.newNick || '').trim();
        const avatar = String(payload?.avatar || 'default');
        const color = String(payload?.color || '');
        await sbInsert('chat_messages', {
          room,
          nick: 'Sistema',
          color: '#000000',
          role: 'admin',
          kind: 'system',
          body: JSON.stringify({ type: 'forceProfile', nick, newNick, avatar, color }),
        });
        break;
      }
      case 'saveAdminProfile': {
        const nick = String(payload?.nick || 'Van Eck').trim();
        const customAvatars = Array.isArray(payload?.customAvatars)
          ? payload.customAvatars.filter((a) => typeof a === 'string' && a.startsWith('data:image/')).slice(0, 20)
          : [];
        await sbInsert('chat_admin_profile', {
          nick_lower: 'van eck',
          nick,
          color: String(payload?.color || 'rainbow'),
          text_color: payload?.textColor || null,
          text_font: payload?.textFont || null,
          avatar: String(payload?.avatar || 'default'),
          rank: String(payload?.rank || 'none'),
          visibility_mode: String(payload?.visibilityMode || 'normal'),
          custom_avatars: customAvatars,
        });
        break;
      }
      case 'kickRoomAll': {
        const room = String(payload?.room || '').trim();
        const nicks = Array.isArray(payload?.nicks)
          ? payload.nicks.map((n) => String(n).trim()).filter(Boolean)
          : [];
        if (!room || !nicks.length) throw new Error('missing_fields');
        await sbInsert('chat_messages', {
          room,
          nick: 'Sistema',
          color: '#000000',
          role: 'admin',
          kind: 'system',
          body: JSON.stringify({ type: 'kickRoom', nicks, reason: payload?.reason || '' }),
        });
        break;
      }
      case 'botLine': {
        const room = String(payload?.room || LOCKED_ROOM);
        const nick = String(payload?.nick || 'Bot').trim();
        const text = String(payload?.text || '').trim();
        if (!text) throw new Error('missing_text');
        await sbInsert('chat_messages', {
          room,
          nick,
          color: '#000000',
          avatar: payload?.avatar || 'default',
          role: 'general',
          kind: 'chat',
          body: text,
        });
        break;
      }
      case 'notice': {
        const room = String(payload?.room || '').trim();
        const text = String(payload?.text || '').trim();
        if (!room || !text) throw new Error('missing_fields');
        await notice(room, text);
        break;
      }
      case 'broadcast': {
        const text = String(payload?.body || '').trim();
        if (!text) throw new Error('missing_body');
        await sbInsert('chat_broadcasts', { body: text });
        break;
      }
      default:
        throw new Error('unknown_action');
    }
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'server_error' });
    return;
  }

  res.status(200).json({ ok: true });
}
