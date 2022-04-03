const config = {
   type: Phaser.AUTO,
   parent: 'phaser-example',
   width: 1651,
   height: 900,
   physics: {
      default: 'arcade',
      arcade: {
         debug: false,
         gravity: { y: 0 }
      }
   },
   scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
   },
   scene: {
      preload: preload,
      create: create,
      update: update
   }
};

const game = new Phaser.Game(config);
var gw;
var gh;
var playerLocations = [];
var Seats = [];
var cardImages = [];
var hiddenCard;
var handsDealt = false;

function preload() {
   this.load.image('star', 'assets/spaceShips_001.png');
   this.load.atlas('cards', 'assets/cards.png', 'assets/cards.json');
}

function create() {
   var self = this;

   this.socket = io();
   this.otherPlayers = this.physics.add.group();

   gw = this.cameras.main.width;
   gh = this.cameras.main.height;

   this.socket.on('showRooms', (rooms) => {
      let i = 100;
      for (const id in rooms){
         const room = rooms[id];
         console.log(room);
         this.add.text(400, i, room.name + ' : ' + Object.keys(room.players).length + '/5');
         if (Object.keys(room.players).length < 5) {
            this.add.text(550, i, 'Join')
               .setInteractive()
               .on('pointerdown', () => this.socket.emit('joinRoom', room.id));
         }
         i += 15;
      }
   });

   this.socket.on('currentPlayers', function (players) {
      console.log('currentPlayers');
      showRoom(self, players);
   });

   this.socket.on('newPlayer', function (playerInfo) {
      console.log('newPlayer');
      
      Seats[playerInfo.pos].disableInteractive();
      Seats[playerInfo.pos].setTint(0x0000ff);
   });

   this.socket.on('deletePlayer', function (playerId) {
      console.log('deletePlayer');
      self.otherPlayers.getChildren().forEach(function (otherPlayer) {
         if (playerId === otherPlayer.playerId) {
            otherPlayer.destroy();
         }
      });
   });
   
   let curHand = 0;
   let hitButton = this.add.text(100, 100, '', { fill: '#0f0' })
      .setInteractive()
      .on('pointerdown', () => {console.log('hit'); this.socket.emit('hit', curHand)});
   let standButton = this.add.text(100, 200, '', { fill: '#f0f'})
      .setInteractive()
      .on('pointerdown', () => {console.log('Stand'); this.socket.emit('stand', curHand)});
   this.socket.on('startTurn', (pos) => {
      console.log('startTurn', pos);
      if (self.pos === pos) {
         hitButton.setText('Hit');
         hitButton.setInteractive();
         standButton.setText('Stand');
         standButton.setInteractive();
      } else {
         hitButton.setText('');
         hitButton.disableInteractive();
         standButton.setText('');
         standButton.disableInteractive();
      }
   });

   this.bustText = this.add.text(16, 16, 'Deal', { fontSize: '32px', fill: '#0000FF' })
      .setInteractive()
      .on('pointerdown', () => {console.log('Deal'); this.socket.emit('newHand')});
   
   // Deal hands
   this.socket.on('dealHands', (players, dealer) => {
      console.log('dealHands');
      // self.bustText.('');
      dealHands(self, players, dealer);
   });

   // Get new card
   this.socket.on('dealCard', (playerInfo, card, hand) => {
      console.log('dealCard');
      console.log(card);
      dealCard(self, playerInfo, card, hand);
   });

   // Get settlement
   this.socket.on('winStatus', (dealer, win) => {
      console.log('winStatus');
      console.log(dealer.hands[0].cards);
      hiddenCard.setTexture('cards', dealer.hands[0].cards[1].Suit + dealer.hands[0].cards[1].Value);
      for (let i = 2; i < dealer.hands[0].cards.length; i++){
         dealCard(self, dealer, dealer.hands[0].cards[i], 0);
      }
      self.bustText.setText(win);
   });
}

function update() {
   if (this) {
   }
}

function showRoom(self, players) {
   resetPlayerPositions();
   for (let i = 0; i < 5; i++) {
      Seats[i] = self.add.image(playerLocations[i].x, playerLocations[i].y, 'star')
      .setInteractive()
      .on('pointerdown', function () {
         console.log('setPos: ' + i);
         self.pos = i;
         self.socket.emit('setPos', i);
         Seats[i].disableInteractive();
         Seats[i].setTint(0x0000ff);
      });
   }
   Object.keys(players).forEach(function (id) {
      console.log(players);
      let player = players[id];
      if (player.pos) {
         Seats[player.pos].disableInteractive();
         Seats[player.pos].setTint(0x0000ff);
      }
   });
}

function resetPlayerPositions() {
   playerLocations = [
      {x : gw * .8, y : gh * .8}, 
      {x : gw * .65, y : gh * .8},
      {x : gw * .5, y : gh * .8},
      {x : gw * .35, y : gh * .8},
      {x : gw * .2, y : gh * .8},
      {x : gw * .5, y : gh * .3}
   ];
}

function dealHands(self, players, dealer) {
   cardImages.forEach( function(card) {
      card.destroy();
   });
   if (hiddenCard) {
      hiddenCard.destroy();
   }

   resetPlayerPositions();
   console.log(players);
   
   for (let i = 0; i < 2; i++){
      Object.keys(players).forEach(function (id) {
         dealCard(self, players[id], players[id].hands[0].cards[i], 0);
      });
      if (i === 0) dealCard(self, dealer, dealer.hands[0].cards[i], 0);
      else dealHiddenCard(self, dealer);
   }
}

function dealCard(self, playerInfo, card, hand) {
   console.log(card);
   cardImages.push(self.add.image(playerLocations[playerInfo.pos].x, playerLocations[playerInfo.pos].y, 'cards', card.Suit + card.Value));
   playerLocations[playerInfo.pos].x += 30;
   console.log(card);
   console.log(playerInfo.hands[hand].total);
}

function dealHiddenCard(self, playerInfo) {
   hiddenCard = self.add.image(playerLocations[playerInfo.pos].x, playerLocations[playerInfo.pos].y, 'cards', 'back');
   playerLocations[playerInfo.pos].x += 30;
}