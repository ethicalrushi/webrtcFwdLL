// Generate random room name if needed
if (!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);

// TODO: Replace with your own channel ID
const drone = new ScaleDrone('b6DBzUwhaA5XaPkS');
// Room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + roomHash;
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let room;
let pc;

let connections = []

console.log(roomName)

function onSuccess() {};
function onError(error) {
  console.error(error);
};

let currID;

drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) {
      onError(error);
    }
  });

  // We're connected to the room and received an array of 'members'
  // connected to the room (including us). Signaling server is ready.
  room.on('members', members => {
    currID = members.length-1;

    if(!connections[currID]) {
      connections[currID] = new RTCPeerConnection(configuration);
    }

    navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    }).then(stream => {
      // Display your local video in #localVideo element
      localVideo.srcObject = stream;

      let videoId = 2;

      for(let i=0; i<6; i++) {
        if(!connections[i]) {
          console.log("Creating new for "+i);
          connections[i] = new RTCPeerConnection(configuration);
        
          connections[i].onicecandidate = event => {
            if (event.candidate) {
              console.log("sending ice");
              sendMessage({'candidate': event.candidate}, i);
            }
          };

          // When a remote stream arrives display it in the #remoteVideo element
          
          connections[i].ontrack = event => {
            console.log("video by:"+i);
            const stream = event.streams[0];
            let remoteVideoName = "remoteVideo"+Math.floor(videoId/2);
            videoId++;
            remoteVideo = document.getElementById(remoteVideoName)
            if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
              remoteVideo.srcObject = stream;
            }
          };
        }
       // Add your stream to be sent to the conneting peer
        stream.getTracks().forEach(track => connections[i].addTrack(track, stream));
      }
  
    if(currID===0) {
      startWebRTC(false, currID);
    }

    for(let j=0; j<currID; j++) { //calling to all previous peers
      startWebRTC(true, j);
    }
    
  });
});

  room.on('member_join', members => {
    //could be utilized with custom signalling server
  });

});

// Send signaling data via Scaledrone
function sendMessage(message, i) {
  let newMessage = {
    peerId: currID,
    destId : i,
    msg: message
  }

  message = newMessage

  drone.publish({
    room: roomName,
    message
  });
}

function startWebRTC(isOfferer, i) {

  if(!connections[i]) {
    connections[i] = new RTCPeerConnection(configuration);
  }

  // If user is offerer let the 'negotiationneeded' event create the offer to ith peer
  if (isOfferer) {
    connections[i].onnegotiationneeded = () => {
      connections[i].createOffer().then(function(description) {
        connections[i].setLocalDescription(description).then(function() {
          sendMessage({'sdp': connections[i].localDescription}, i);
        }).catch(onError);
    });
  }
}

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }

    if(message.destId!=currID) {
      return;
    }

    let pId = message.peerId;

    if (message.msg.sdp) {
      // This is called after receiving an offer or answer from another peer
      connections[pId].setRemoteDescription(new RTCSessionDescription(message.msg.sdp), () => {
        // When receiving an offer lets answer it
        if (connections[pId].remoteDescription.type === 'offer') {
          connections[pId].createAnswer().then(function(description) {
            connections[pId].setLocalDescription(description).then(function() {
              sendMessage({'sdp': connections[pId].localDescription}, pId);
            }).catch(onError);
        });
        }
      }, onError);
    } else if (message.msg.candidate) {
      console.log("ice added");
      // Add the new ICE candidate to our connections remote description
      connections[pId].addIceCandidate(
        new RTCIceCandidate(message.msg.candidate), onSuccess, onError
      );
    }
  });
}