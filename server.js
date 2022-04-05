const { randomUUID } = require('crypto');
const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const rooms = {};
var defaultRooms = [];

 /**
  * Will connect a socket to a specified room
  * socket: A connected socket.io socket
  * room: An object that represents a room from the `rooms` instance variable object
  */
const joinRoom = (socket, playerInfo, roomId) => {
   let room = rooms[roomId];
   console.log('joinRoom');
   room.players[socket.id] = playerInfo;
   socket.join(room.id);
   // store the room id in the socket for future use
   socket.roomId = room.id;
   console.log(socket.id, "Joined", room.id);
};
 
 /**
  * Will make the socket leave any rooms that it is a part of
  * socket: A connected socket.io socket
  */
const leaveRooms = (socket) => {
   const roomsToDelete = [];
   for (const id in rooms) {
      const room = rooms[id];
      // check to see if the socket is in the current room
      if (room.players[socket.id]) {
         socket.leave(id);
         // remove the socket from the room
         if (room.positions[room.players[socket.id].pos] === room.turn.pos) {
            nextTurn(room);  
         }
         room.positions[room.players[socket.id].pos] = {
            playerId : null,
            hasPlayer : false
         };
         delete room.players[socket.id];
      }
      // Prepare to delete any rooms that are now empty
      if (room.players.length == 0 && !(room.id in defaultRooms)) {
         roomsToDelete.push(room);
      }
   }
 
   // Delete all the empty rooms that we found earlier
   for (const room of roomsToDelete) {
      delete rooms[room.id];
   }
};

const maxSeats = 5;
const shoeSize = 6;
const dealer = { pos: maxSeats, hands: [{cards: [], total: 0}]};
const suits = ['spades', 'diamonds', 'clubs', 'hearts'];
const values = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
let card = null;

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

createRooms();

io.on('connection', function (socket) {
   console.log('a user connected');

   // Create a new player and add it to our players object
   let player = {
      playerId: socket.id,
      pos: null,
      hands: [{cards: [], total: 0}],
      money: 1000,
      betPlaced: false,
      betAmount: 0
   };
   let room;

   console.log(player);

   // When a player connects, show them the "select a room" menu and the details about the rooms
   socket.emit('showRooms', rooms);

   // Send the players object ot he new player
   socket.on('joinRoom', (roomId) => {
      joinRoom(socket, player, roomId);
      room = rooms[socket.roomId];
      
      io.in(socket.roomId).emit('currentPlayers', room.players);
   });
   
   socket.on('disconnect', () => {
      console.log('user disconnected')
      // Remove this player
      leaveRooms(socket);
      // Emit a message to all players to remove this player
      io.in(socket.roomId).emit('deletePlayer', socket.id);
   });

   socket.on('setPos', (pos) => {
      setPos(room, pos, socket.id);
      // Update all other players of the new player
      socket.to(socket.roomId).emit('newPlayer', room.players[socket.id]);
   });

   // Deal hands
   socket.on('placeBet', (bet) => {
      console.log('betPlaced');
      room.players[socket.id].betPlaced = true;
      room.players[socket.id].betAmount = bet;
      room.players[socket.id].money -= bet;

      if (Object.keys(room.players).every((x) => room.players[x].betPlaced)){
         newHand(room);
      }
   });

   // Handle a hit request
   socket.on('hit', (hand) => {
      // Get a next card
      let card = handleHit(room, room.players[socket.id], hand);
      io.in(socket.roomId).emit('dealCard', room.players[socket.id], card, hand);
      if (room.players[socket.id].hands[hand].total > 21){
         nextTurn(room, room.players[socket.id].pos + 1);
      }
   });

   // Handle stand request and test win
   socket.on('stand', () => {
      nextTurn(room, room.players[socket.id].pos + 1);
   });
});

server.listen(8081, function () {
  console.log(`Listening on ${server.address().port}`);
});

// Create some default rooms for players to join
// Each room has its own copy of the game state including players, deck, and 
function createRooms(){
   console.log('createRooms');
   for (let i = 1; i <= 3; i++) {
      let room = {
         id: randomUUID(),
         name: 'Table ' + i,
         players: {},
         dealer: dealer,
         positions: createPositions(),
         deck: shuffleDeck(createDeck()),
         turn: {inProgress: false, pos: 0},
         private: false
      };
      rooms[room.id] = room;
      defaultRooms.push(room.id);
   }
}

// Creates a deck of size shoeSize in order
function createDeck() {
   console.log('createDeck');
   let deck = [];
   for (let i = 0; i < shoeSize; i++) {
      for (suit of suits) {
         for (value of values) {
            let card = { Value: value, Suit: suit};
            deck.push(card);
         }
      }
   }
   return deck;
}

// Create the positions for each seat
// The positions store where a player has sat so we deal in the correct order
function createPositions() {
   console.log('createPositions');
   let positions = [];
   for (let i = 0; i < maxSeats; i++) {
      positions[i] = {
         playerId : null,
         hasPlayer : false
      };
   }
   return positions;
}

// Set a players position when they sit down
function setPos(room, pos, playerId) {
   console.log('setPos : ' + pos);
   room.positions[pos].playerId = playerId;
   room.positions[pos].hasPlayer = true;
   room.players[playerId].pos = pos;
}

// Shuffles the full deck
function shuffleDeck(deck) {
   console.log('shuffleDeck');
   for (let i = deck.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * i);
      let temp = deck[i];
      deck[i] = deck[j];
      deck[j] = temp;
   }
   return deck;
}

// Returns the next card in the deck
function getNextCard(deck) {
   console.log('getNextCard');
   return deck.pop();
}

function newHand(room) {
   console.log('newHand');
   if (room.turn.inProgress) return;
   room.turn.inProgress = false;
   room.turn.pos = -1;
   Object.keys(room.players).forEach(id => room.players[id].betPlaced = false);
   generateHands(room);
   io.in(room.id).emit('dealHands', room.players, room.dealer);
   nextTurn(room);
}

// Generates a new hand for each player and the dealer
function generateHands(room) {
   console.log('generateHands');
   if (room.turn.inProgress) return;

   // Take away each players cards
   for (let pos = 0; pos < maxSeats; pos++) {
      if (room.positions[pos].hasPlayer)
         room.players[room.positions[pos].playerId].hands = [{cards: [], total: 0}];
   }
   room.dealer.hands = [{cards: [], total: 0}];

   // Give each player and the dealer two cards
   for (var i = 0; i < 2; i++){
      for (let pos = 0; pos < maxSeats; pos++) {
         if (room.positions[pos].hasPlayer) {
            dealCard(room.players[room.positions[pos].playerId], getNextCard(room.deck), 0);
         }
      }
      dealCard(room.dealer, getNextCard(room.deck), 0);
   }
}

function nextTurn(room) {
   room.turn.inProgress = false;
   let i = room.turn.pos + 1;
   for (i; i < room.positions.length; i++) {
      if (room.positions[i].hasPlayer && !room.turn.inProgress) {
         io.in(room.id).emit('startTurn', i);
         room.turn.inProgress = true;
         room.turn.pos = i;
      }
   }
   if (!room.turn.inProgress) {
      let dealerTotal = getDealersHand(room, room.dealer);
      Object.keys(room.players).forEach(id => {
         let player = room.players[id];
         for (hand in player.hands){
            let win = winStatus(player, hand, dealerTotal);
            io.to(player.playerId).emit('winStatus', room.dealer, win);
         }
      });
   }
}

// Deal a card and add to that hand's total
function dealCard(playerInfo, card, hand) {
   console.log('dealCard');
   playerInfo.hands[hand].cards.push(card);
   playerInfo.hands[hand].total = calculatePlayerTotal(playerInfo.hands[hand].cards);
}

function calculatePlayerTotal (cards) {
   console.log('calculatePlayerTotal');
   let total = 0;
   let numAces = 0;
   cards.forEach(card => {
      if (card.Value == 'Ace') {
         numAces++;
      } else if (['Jack', 'Queen', 'King'].includes(card.Value)) {
         total += 10;
      } else {
         total += parseInt(card.Value);
      }
   });
   for (let i = 0; i < numAces; i++) {
      if (total + 11 <= 21) {
         total += 11;
      } else {
         total += 1;
      }
   }
   return total;
}
// On hit, deal a card and return the hand's status
function handleHit(room, playerInfo, hand) {
   console.log('handleHit');
   card = getNextCard(room.deck);
   dealCard(playerInfo, card, hand);

   return card;
}

// On stand, complete the dealer's moves and return status
function winStatus(playerInfo, hand, dealerTotal) {
   console.log('winStatus');
   let playerTotal = playerInfo.hands[hand].total;

   if (playerTotal > 21){
      return 'bust';
   }
   else if ((dealerTotal > 21) || (dealerTotal < playerTotal)) {
      return 'win';
   } else if (dealerTotal === playerTotal) {
      return 'push';
   } else {
      return 'lose';
   }
}

// Hit for the dealer until score is above 16
function getDealersHand(room, dealer) {
   console.log('getDealersHand');
   while (dealer.hands[0].total < 17) {
      dealCard(dealer, getNextCard(room.deck), 0);
   }
   return dealer.hands[0].total;
}