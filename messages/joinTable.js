// Sent when the user clicks on the "Join" button in the lobby
// "data" example:
/*
    {
        table_id: 15103,
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const messages = require('../messages');
const notify = require('../notify');

exports.step1 = (socket, data) => {
    // Local variables
    data.userID = socket.userID;
    data.gameID = data.table_id;

    /*
        Validation
    */

    // Validate that this table exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.warn(`Game #${data.gameID} does not exist.`);
        data.reason = `Game #${data.gameID} does not exist.`;
        notify.playerDenied(socket, data);
        return;
    }

    // The logic for joining shared replay is in a separate file for
    // organizational purposes
    if (game.shared_replay) {
        messages.join_shared_replay.step1(socket, data);
        return;
    }

    // Validate that the player is not already joined to this table
    let found = false;
    for (const player of game.players) {
        if (player.userID === socket.userID) {
            found = true;
            break;
        }
    }
    if (found) {
        logger.warn(`This player is already in game #${data.gameID}.`);
        data.reason = `You are already in game #${data.gameID}.`;
        notify.playerDenied(socket, data);
        return;
    }

    // Validate that this table does not already have the maximum amount of
    // players
    if (game.players.length === game.max_players) {
        logger.warn(`messages.join was called for game #${data.gameID}, but it has the maximum amount of players already.`);
        data.reason = `That table has a maximum limit of ${game.max_players} players.`;
        notify.playerDenied(socket, data);
        return;
    }

    /*
        Join
    */

    logger.info(`User "${socket.username}" joined game: #${data.gameID} (${game.name})`);

    // Keep track of the user that joined
    let time = globals.startingTime; // In milliseconds
    if (game.timed && game.name === '!test') {
        time = 10 * 1000; // 10 seconds for testing
    } else if (!game.timed) {
        // In non-timed games, start each player with 0 "time left"
        // It will decrement into negative numbers to show how much time they
        // are taking
        time = 0;
    }
    game.players.push({
        hand: [],
        userID: socket.userID,
        username: socket.username,
        present: true,
        socket,
        time,
        notes: {}, // All of the player's notes, indexed by card order
    });
    notify.allTableChange(data);
    notify.gameMemberChange(data);

    // Set their status
    socket.currentGame = data.gameID;
    socket.status = 'Pre-Game';
    notify.allUserChange(socket);

    // Send them a "joined" message
    // (to let them know they successfully joined the table)
    socket.emit('message', {
        type: 'joined',
        resp: {
            table_id: data.gameID,
        },
    });
};
