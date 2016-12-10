const NoirContribIrc = require('./js/Noir/NoirContribIrc/NoirContribIrc.js');
const { ChatAreaFactory } = require('./js/Noir/Noir/ChatArea.js');
const { remote }     = require('electron');
const linkifyHtml    = require('linkifyjs/html');
const marked         = require('marked');
const emojione       = require('emojione');

let emojis = Object.keys(emojione.emojioneList).filter(e => {
	return emojione.shortnameToUnicode(e) != "🤙";
});

let chatAreaFactory = (new ChatAreaFactory);

chatAreaFactory.addAutoCompleteListener(function ircAutoComplete(e) {

	if (! e.word.match(/^\:.+$/)) {
		return;
	}

	emojis
		.filter(em => {
			return em.slice(0, e.word.length) == e.word;
		})
		.forEach(em => {
			let unicode = emojione.shortnameToUnicode(em);
			e.autoCompleteTooltip.suggest(
				unicode,
				unicode + " " + em,
				em.length
			);
		});
});

remote.getGlobal('SETTINGS').connections
	.filter(cxn => cxn.type == 'noir-contrib-irc' )
	.forEach(cxn => {
		var config = cxn.config || {};
		if (config.channels) {
			cxn.channels = config.channels;
			delete config['channels'];
		}
		if (! config.userName) {
			config.userName = cxn.userName;
		}
		if (! config.nick) {
			config.nick = cxn.userName;
		}
		cxn.config = config;
		var irc = new NoirContribIrc(cxn.host, cxn.name || cxn.host, cxn.userName, cxn.config, cxn.channels, chatAreaFactory);

		irc.displayedMessageTransforms.push(function strToMarkdown(str) {
			return marked(str, {
				gfm: true,
				breaks: true,
				sanitize: true,
				smartypants: true
			});
		});

		irc.displayedMessageTransforms.push(function strAddLinks(str) {
			return linkifyHtml(str);
		});

		irc.sentMessageTransforms.push(function strInjectEmoji(str) {
			return emojione.shortnameToUnicode(str);
		});

	})
