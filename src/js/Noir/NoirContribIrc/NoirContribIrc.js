const irc                                = require('irc');
const ChatWindow                         = require("./ChatWindow");
const ChatSidebar                        = require("./ChatSidebar");
const {app, ipcRenderer, shell, remote } = require('electron')


module.exports = class NoirContribIrc {
	constructor(host, connectionName, userName, config, channels, chatAreaFactory, tabset) {

		config.autoConnect = false;

		this.client = new irc.Client(host, userName, config);
		this.userName = userName,
		this.tabset = tabset;

		this.displayedMessageTransforms = [];
		this.sentMessageTransforms      = [];
		this.autoCompleteListeners      = [];
		this.connectionName = connectionName;

		this.windows = {};
		this.chatAreaFactory = chatAreaFactory;

		this.sidebarEntry = new ChatSidebar(connectionName)
			.onWindowSelect( e => {
				this.showWindow(e.windowId);
			});


		this.client.connect(() => {
			channels.forEach(id => {
				if (id[0] == '#') {
					this.joinChannel(id);
				}
			});
		});

		document.getElementById('sidebar').appendChild(this.sidebarEntry.view.element);

		this.client.addListener("join", (channel, who) => {
			if (! this.windows.hasOwnProperty(channel)) {
				if (who == userName) {
					this.joinChannel(channel);
				}
				return;
			}
			this.windows[channel].addParticipant(who, this.getTimestamp());
		});

		this.client.addListener('error', (message) => {
			console.error('error: ', message);
		});

		this.client.addListener('names', (channel, users) => {
			if (! this.windows.hasOwnProperty(channel)) {
				return;
			}

			this.windows[channel].setParticipants(users);
		});

		this.client.addListener('raw', (message) => {
	    	console.log(message.command + ' ' + message.args.join(' '), this.getTimestamp());
		});

		this.client.addListener('part', (channel, who, reason) => {
			if (! this.window.hasOwnProperty(channel)) {
				return;
			}
			this.windows[channel].removeParticipant(who, reason, this.getTimestamp());
		    console.log('%s has left %s: %s', who, channel, reason);
		});

		this.client.addListener('kick', function(channel, who, by, reason) {
			if (! this.window.hasOwnProperty(channel)) {
				return;
			}
			this.windows[channel].removeParticipant(who, reason, this.getTimestamp());
		    console.log('%s was kicked from %s by %s: %s', who, channel, by, reason);
		});

		this.client.addListener("message", (from, to, text, message) => {
			console.log("MESSAGE", from, to, text, message);
			var channel = message.args[0];
			if (to == userName) {
				channel = from;
				if (! this.windows.hasOwnProperty(channel)) {
					this.openConversation(channel);
				}
			} else if (! this.windows.hasOwnProperty(channel)) {
				return;
			}

			if (to == userName || text.indexOf(userName) >= 0) {
				var notification = new window.Notification("Message from " + from, { body: text, silent: true });
				notification.onclick = function() {
					ipcRenderer.send('focusWindow', 'main');
				};
			}

			this.windows[channel].addChatMessage(from, text, this.getTimestamp());
			if (! this.windows[channel].isVisible()) {
				this.sidebarEntry.handleNotification(channel, 1);
				this.updateBadgeCount();
			}
		});
	}

	updateBadgeCount() {
		if (remote.app.dock && remote.app.dock.setBadge) {
			var count = this.sidebarEntry.getUnreadCounts();
			if (count == 0) {
				remote.app.dock.setBadge("");
			} else {
				remote.app.dock.setBadge(count.toString());
			}
		}
	}

	joinChannel(channelId) {
		var window = this.openWindow(channelId);

		this.client.join(channelId, () => {
			this.client.send('NAMES', channelId.slice(1));
			console.log("JOIN", arguments);
		});
	}

	leaveChannel(channelId) {
		this.closeWindow(channelId);
		this.client.part(channelId);
	}

	openConversation(target) {
		return this.openWindow(target);
	}

	closeConversation(target) {
		this.closeWindow(target);
	}

	openWindow(id) {

		// prevent duplicate windows
		if (this.windows.hasOwnProperty(id)) {
			return this.windows[id];
		}

		let chatWindow = new ChatWindow(this.userName, id, this.chatAreaFactory)
			.onOpenUrl( e => {
				shell.openExternal( e.url );
			})
			.onMessage( e => {
				let matches = e.message.match(/^\/join\s+(#[^\s]+)/);
				if (matches) {
					debugger;
					this.joinChannel(matches[1]);
					return;
				}
				var withConn = () => {
					this.client.say(id, e.message);
					chatWindow.addChatMessage(this.userName, e.message, this.getTimestamp());
				};
				if ( this.client.conn === null ) {
					this.client.connect( withConn );
				} else {
					withConn();
				}
			})
			.onConversationOpened( e => {
				this.openConversation( e.contact );
				this.showWindow(e.contact);
			});


		chatWindow.displayedMessageTransforms = Object.create(this.displayedMessageTransforms);
		chatWindow.sentMessageTransforms      = Object.create(this.sentMessageTransforms);
		chatWindow.autoCompleteListeners      = Object.create(this.autoCompleteListeners);

		this.sidebarEntry.registerWindow(id, 0);

		let tab = this.tabset
			.add(this.connectionName+" "+id)
			.setLabel( id )
			.setContents( chatWindow.view.element )
			.onShow((e) => {
				this.sidebarEntry.handleWindowActivated(id);
				this.updateBadgeCount();
				chatWindow.show();
			})
			.onHide((e) => {
				console.log(e);
			})
			.onClose((e) => {
				this.closeWindow(id);
				console.log(e);
			});

		this.windows[id] = chatWindow;
		return chatWindow;
	}

	closeWindow(id) {
		this.sidebarEntry.unregisterWindow(id);
		this.tabset.remove(this.connectionName+" "+id);
		// this.element.removeChild(window.view.element);

		delete this.windows[id];
	}

	showWindow(id) {
		this.tabset.show(this.connectionName+" "+id);
	}

	getTimestamp() {
		return (new Date()) / 1000;
	}

	onApplicationClose() {

	}

	onApplicationOpen() {

	}
}

