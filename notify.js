/*
    This is a collection of functions used to notify groups of people about
    something (either everyone connected to the server or everyone in a game).
    Note that notify in this sense does not explicitly mean the "notify"
    message; it can be alterting groups of users about anything.
*/

// Imports
const globals = require('./globals');

/*
    Functions that notify all users
*/

exports.allUserChange = (socket) => {
    // Send everyone an update about this user
    for (const userID of Object.keys(globals.connectedUsers)) {
        globals.connectedUsers[userID].emit('message', {
            type: 'user',
            resp: {
                id: socket.userID,
                name: socket.username,
                status: socket.status,
            },
        });
    }
};

exports.allTableChange = (data) => {
    // Send everyone an update about this table
    for (const userID of Object.keys(globals.connectedUsers)) {
        playerTable(globals.connectedUsers[userID], data);
    }
};

exports.allTableGone = (data) => {
    // Send everyone an update about this table
    for (const userID of Object.keys(globals.connectedUsers)) {
        globals.connectedUsers[userID].emit('message', {
            type: 'table_gone',
            resp: {
                id: data.gameID,
            },
        });
    }
};

/*
    Functions that notify members of the game (and the spectators of that game)
*/

exports.gameMemberChange = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Send the people in the game an update about the new player
    for (const player of game.players) {
        player.socket.emit('message', {
            type: 'game',
            resp: {
                name: game.name,
                running: game.running,
                num_players: game.players.length,
                max_players: game.max_players,
                variant: game.variant,
                allow_spec: game.allow_spec,
                timed: game.timed,
                reorder_cards: game.reorder_cards,
                shared_replay: game.shared_replay,
            },
        });

        // Tell the client to redraw all of the lobby rectanges to account for
        // the new player (it might be wasteful, but this is how the real
        // server appears to work)
        for (let i = 0; i < game.players.length; i++) {
            const player2 = game.players[i];

            player.socket.emit('message', {
                type: 'game_player',
                resp: {
                    index: i,
                    name: player2.socket.username,
                    you: (player.userID === player2.userID),
                    present: game.players[i].present,
                    num_played: player2.socket.num_played,
                    average_score: player2.socket.average_score,
                    strikeout_rate: player2.socket.strikeout_rate,
                },
            });
        }
    }

    // Lastly, send the table owner whether or not the "Start Game" button
    // should be greyed out
    for (const player of game.players) {
        if (player.userID === game.owner) {
            player.socket.emit('message', {
                type: 'table_ready',
                resp: {
                    ready: (game.players.length >= 2),
                },
            });
            break;
        }
    }
};

exports.gameConnected = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Make a list of who is currently connected of the players in the
    // current game
    const list = [];
    for (const player of game.players) {
        list.push(player.present);
    }

    // Send a "connected" message to all of the users in the game
    const connMsg = {
        type: 'connected',
        resp: {
            list,
        },
    };

    for (let i = 0; i < game.players.length; i++) {
        game.players[i].socket.emit('message', connMsg);
    }

    // Also send it to the spectators
    for (const userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', connMsg);
    }
};

exports.gameAction = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];
    const lastIndex = game.actions.length - 1;
    const action = game.actions[lastIndex];

    // Send the people in the game an update about the new action
    for (let i = 0; i < game.players.length; i++) {
        // Scrub card info from cards if the card is in their own hand
        let scrubbed = false;
        let scrubbedAction;
        if (action.type === 'draw' && action.who === i) {
            scrubbed = true;
            scrubbedAction = JSON.parse(JSON.stringify(action));
            scrubbedAction.rank = undefined;
            scrubbedAction.suit = undefined;
        }

        game.players[i].socket.emit('message', {
            type: ('text' in action ? 'message' : 'notify'),
            resp: (scrubbed ? scrubbedAction : action),
        });
    }

    // Also send the spectators an update
    for (const userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', {
            type: ('text' in action ? 'message' : 'notify'),
            resp: action,
        });
    }
};

exports.gameSpectators = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Send the message to all the players in the game
    for (const player of game.players) {
        playerSpectators(player.socket, data);
    }

    // Also send it to the spectators
    for (const userID of Object.keys(game.spectators)) {
        playerSpectators(game.spectators[userID], data);
    }
};

exports.gameTime = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Create the clock message
    const times = [];
    for (const player of game.players) {
        times.push(player.time);
    }
    const clockMsg = {
        type: 'clock',
        resp: {
            times,
            active: data.end ? null : game.turn_player_index,
        },
    };

    // Send the clock message for this player to all the players in the game
    for (const player of game.players) {
        player.socket.emit('message', clockMsg);
    }

    // Also send it to the spectators
    for (const userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', clockMsg);
    }
};

exports.gameSound = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Send a sound notification
    for (let i = 0; i < game.players.length; i++) {
        const player = game.players[i];

        // Prepare the sound message
        let sound = 'turn_other';
        if (game.sound !== null) {
            sound = game.sound;
        } else if (i === game.turn_player_index) {
            sound = 'turn_us';
        }
        const msg = {
            type: 'sound',
            resp: {
                file: sound,
            },
        };

        player.socket.emit('message', msg);
    }

    // Also send it to the spectators
    for (const userID of Object.keys(game.spectators)) {
        // Prepare the sound message
        // (the code is duplicated here because I don't want to mess with
        // having to change the file name back to default)
        let sound = 'turn_other';
        if (game.sound !== null) {
            sound = game.sound;
        }
        const msg = {
            type: 'sound',
            resp: {
                file: sound,
            },
        };
        game.spectators[userID].emit('message', msg);
    }
};

exports.gameReorderCards = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];
    const hand = game.players[data.index].hand;

    // Make an array that represents the order of the player's hand
    const handOrder = [];
    for (let i = 0; i < hand.length; i++) {
        const card = hand[i];
        handOrder.push(card.order);
    }

    // Send the card reordering notification
    const msg = {
        type: 'notify',
        resp: {
            type: 'reorder',
            who: data.index,
            hand: handOrder,
        },
    };
    for (let i = 0; i < game.players.length; i++) {
        const player = game.players[i];
        player.socket.emit('message', msg);
    }
    for (const userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', msg);
    }
};

exports.gameBoot = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Send a boot notification
    const msg = {
        type: 'notify',
        resp: {
            type: 'boot',
            who: data.who,
        },
    };
    for (let i = 0; i < game.players.length; i++) {
        const player = game.players[i];
        player.socket.emit('message', msg);
    }
    for (const userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', msg);
    }
};

/*
    Functions that notify all spectators of the game
*/

exports.spectatorsNote = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    const msg = {
        type: 'note',
        resp: {
            order: data.order,
            // The order of the card in the deck that these notes correspond to
            notes: game.deck[data.order].notes,
            // "notes" is an array of strings, one for each player
        },
    };

    for (const userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', msg);
    }
};

/*
    Functions that notify a specific user/player
*/

const playerTable = (socket, data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Find out if this player is seated at this table
    let joined = false;
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === socket.userID) {
            joined = true;
            data.index = i;
            break;
        }
    }

    socket.emit('message', {
        type: 'table',
        resp: {
            id: data.gameID,
            name: game.name,
            joined,
            num_players: (game.shared_replay ? Object.keys(game.spectators).length : game.players.length),
            max_players: game.max_players,
            allow_spec: game.allow_spec,
            owned: socket.userID === game.owner,
            running: game.running,
            variant: game.variant,
            our_turn: (joined && game.running && game.turn_player_index === data.index),
            shared_replay: game.shared_replay,
        },
    });
};
exports.playerTable = playerTable;

exports.playerGameStart = (socket) => {
    socket.emit('message', {
        type: 'game_start',
        resp: {
            replay: (socket.status === 'Replay' || socket.status === 'Shared Replay'),
        },
    });
};

exports.playerAction = (socket, data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    socket.emit('message', {
        type: 'action',
        resp: {
            can_clue: (game.clue_num > 0),
            can_discard: (game.clue_num < 8),
            can_blind_play_deck: (game.deckIndex === game.deck.length - 1),
        },
    });
};

const playerSpectators = (socket, data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Build an array with the names of all of the spectators
    const names = [];
    for (const userID of Object.keys(game.spectators)) {
        names.push(game.spectators[userID].username);
    }

    // Send it
    socket.emit('message', {
        type: 'spectators',
        resp: {
            names,
        },
    });
};
exports.playerSpectators = playerSpectators;

exports.playerReplayLeader = (socket, data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    socket.emit('message', {
        type: 'replay_leader',
        resp: {
            name: game.leader,
        },
    });
};

exports.playerDenied = (socket, data) => {
    socket.emit('message', {
        type: 'denied',
        resp: {
            reason: data.reason,
        },
    });
};
