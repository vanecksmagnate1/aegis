import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminToken.js';
import { sbInsert, sbDelete, sbUpdate, sbSelect, sbCount } from './_lib/supabaseRest.js';

const LOCKED_ROOM = 'Sala General';
const MAX_BANNERS = 10;
const MAX_EMOTICONS = 60;
const MAX_HELPER_MESSAGES = 20;
const HELPER_NICK_COLOR = '#1958D6';
const MAX_WORD_FILTERS = 200;
const MAX_HIDDEN_DEFAULTS = 300;
const MAX_ENABLED_FRAMES = 100;
const AVAILABLE_THEMES = ['default', 'royale-obsidian'];

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
        // Al banear se borra todo el historial de mensajes de esa persona
        // (no solo se la expulsa) para que no quede registro público de lo
        // que escribió. wipe:true le avisa a los clientes conectados que
        // además de anunciar la expulsión, tienen que sacar esos mensajes
        // de su vista actual (ver handleIncomingMessage en el cliente).
        await sbDelete('chat_messages', 'nick', nick);
        await sbInsert('chat_messages', {
          room: payload?.room || LOCKED_ROOM,
          nick: 'Sistema',
          color: '#000000',
          role: 'admin',
          kind: 'system',
          body: JSON.stringify({ type: 'kick', nick, reason: payload?.reason || '', wipe: true }),
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
          frame: String(payload?.frame || 'none'),
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
      case 'addBanner': {
        const imageData = String(payload?.imageData || '');
        const linkUrl = String(payload?.linkUrl || '').trim();
        if (!imageData.startsWith('data:image/')) throw new Error('invalid_image');
        const count = await sbCount('chat_banners', 'id');
        if (count >= MAX_BANNERS) throw new Error('too_many_banners');
        await sbInsert('chat_banners', { image_data: imageData, link_url: linkUrl || null, sort_order: count });
        break;
      }
      case 'deleteBanner': {
        const id = Number(payload?.id);
        if (!id) throw new Error('missing_id');
        await sbDelete('chat_banners', 'id', id);
        break;
      }
      case 'setBannerRotationMinutes': {
        const minutes = Math.max(1, Math.min(120, Number(payload?.minutes) || 5));
        await sbUpdate('chat_banner_settings', 'id', 'true', { rotation_minutes: minutes });
        break;
      }
      case 'addEmoticon': {
        const imageData = String(payload?.imageData || '');
        if (!imageData.startsWith('data:image/')) throw new Error('invalid_image');
        const count = await sbCount('chat_custom_emoticons', 'id');
        if (count >= MAX_EMOTICONS) throw new Error('too_many_emoticons');
        const shortcode = `:e${crypto.randomBytes(4).toString('hex')}:`;
        await sbInsert('chat_custom_emoticons', { shortcode, image_data: imageData });
        break;
      }
      case 'deleteEmoticon': {
        const id = Number(payload?.id);
        if (!id) throw new Error('missing_id');
        await sbDelete('chat_custom_emoticons', 'id', id);
        break;
      }
      case 'saveHelperConfig': {
        await sbUpdate('chat_helper_config', 'id', 'true', {
          icon: String(payload?.icon || 'default'),
          nick: String(payload?.nick || 'Ayudante').trim().slice(0, 24) || 'Ayudante',
          text_color: payload?.textColor || null,
          interval_minutes: Math.max(1, Math.min(1440, Number(payload?.intervalMinutes) || 30)),
          active: !!payload?.active,
        });
        break;
      }
      case 'addHelperMessage': {
        const bodyText = String(payload?.body || '').trim();
        if (!bodyText) throw new Error('missing_body');
        const count = await sbCount('chat_helper_messages', 'id');
        if (count >= MAX_HELPER_MESSAGES) throw new Error('too_many_messages');
        await sbInsert('chat_helper_messages', { body: bodyText, sort_order: count });
        break;
      }
      case 'deleteHelperMessage': {
        const id = Number(payload?.id);
        if (!id) throw new Error('missing_id');
        await sbDelete('chat_helper_messages', 'id', id);
        break;
      }
      case 'editBanner': {
        const id = Number(payload?.id);
        if (!id) throw new Error('missing_id');
        const patch = {};
        if (typeof payload?.imageData === 'string' && payload.imageData.startsWith('data:image/')) patch.image_data = payload.imageData;
        if (typeof payload?.linkUrl === 'string') patch.link_url = payload.linkUrl.trim() || null;
        if (!Object.keys(patch).length) throw new Error('nothing_to_update');
        await sbUpdate('chat_banners', 'id', id, patch);
        break;
      }
      case 'moveBanner': {
        const id = Number(payload?.id);
        const direction = payload?.direction === 'up' ? 'up' : 'down';
        if (!id) throw new Error('missing_id');
        const rows = await sbSelect('chat_banners', 'select=id,sort_order&order=sort_order.asc');
        const idx = rows.findIndex((r) => r.id === id);
        if (idx === -1) throw new Error('not_found');
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx >= 0 && swapIdx < rows.length) {
          const a = rows[idx];
          const b = rows[swapIdx];
          await sbUpdate('chat_banners', 'id', a.id, { sort_order: b.sort_order });
          await sbUpdate('chat_banners', 'id', b.id, { sort_order: a.sort_order });
        }
        break;
      }
      case 'editHelperMessage': {
        const id = Number(payload?.id);
        const bodyText = String(payload?.body || '').trim();
        if (!id || !bodyText) throw new Error('missing_fields');
        await sbUpdate('chat_helper_messages', 'id', id, { body: bodyText });
        break;
      }
      case 'fireHelperMessageNow': {
        const id = Number(payload?.id);
        if (!id) throw new Error('missing_id');
        const msgRows = await sbSelect('chat_helper_messages', `id=eq.${id}&select=body`);
        const msg = msgRows[0];
        if (!msg) throw new Error('not_found');
        const cfgRows = await sbSelect('chat_helper_config', 'id=eq.true&select=icon,nick,text_color');
        const cfg = cfgRows[0] || {};
        await sbInsert('chat_messages', {
          room: LOCKED_ROOM,
          nick: cfg.nick || 'Ayudante',
          color: HELPER_NICK_COLOR,
          text_color: cfg.text_color || null,
          avatar: cfg.icon || 'default',
          role: 'general',
          kind: 'chat',
          body: msg.body,
        });
        await sbUpdate('chat_helper_config', 'id', 'true', { last_sent_at: new Date().toISOString() });
        break;
      }
      case 'addWordFilter': {
        const word = String(payload?.word || '').trim();
        const replacement = String(payload?.replacement || '').trim();
        if (!word || !replacement) throw new Error('missing_fields');
        const count = await sbCount('chat_word_filters', 'id');
        if (count >= MAX_WORD_FILTERS) throw new Error('too_many_filters');
        await sbInsert('chat_word_filters', { word, replacement });
        break;
      }
      case 'editWordFilter': {
        const id = Number(payload?.id);
        if (!id) throw new Error('missing_id');
        const patch = {};
        if (typeof payload?.word === 'string' && payload.word.trim()) patch.word = payload.word.trim();
        if (typeof payload?.replacement === 'string' && payload.replacement.trim()) patch.replacement = payload.replacement.trim();
        if (!Object.keys(patch).length) throw new Error('nothing_to_update');
        await sbUpdate('chat_word_filters', 'id', id, patch);
        break;
      }
      case 'deleteWordFilter': {
        const id = Number(payload?.id);
        if (!id) throw new Error('missing_id');
        await sbDelete('chat_word_filters', 'id', id);
        break;
      }
      case 'setHiddenDefaultEmoticons': {
        const hidden = Array.isArray(payload?.hidden)
          ? payload.hidden.filter((e) => typeof e === 'string' && e.length && e.length <= 8).slice(0, MAX_HIDDEN_DEFAULTS)
          : [];
        await sbUpdate('chat_emoticon_settings', 'id', 'true', { hidden_defaults: hidden });
        break;
      }
      case 'setEnabledFrames': {
        const enabled = Array.isArray(payload?.enabled)
          ? payload.enabled.filter((f) => typeof f === 'string' && f.length && f.length <= 30).slice(0, MAX_ENABLED_FRAMES)
          : [];
        await sbUpdate('chat_frame_settings', 'id', 'true', { enabled_defaults: enabled });
        break;
      }
      case 'setTheme': {
        const theme = String(payload?.theme || '').trim();
        if (!AVAILABLE_THEMES.includes(theme)) throw new Error('invalid_theme');
        await sbUpdate('chat_theme_settings', 'id', 'true', { active_theme: theme, forced_at: new Date().toISOString() });
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
