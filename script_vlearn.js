if(!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);

const roomName = 'observable-' + roomHash;
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }],
};

let nodeID;
let leftChildID = null;
let rightChildID = null;
let parentNodeID;
let isPresenter; //to be used in future
let isTeacher; //primary presenter
let connections = []; //can also use string keys like "parent", "left" instead of ids
let presenterStream = null;

function onSuccess() {};

function onError(error) {
  console.error(error);
};

function setupParentNode(id) {
  connections[id].onicecandidate = event => {
    if (event.candidate) {
        sendMessage({'candidate': event.candidate}, "candidate", id);
    }
  };

  connections[id].ontrack = event => {
      const recievedStream = event.streams[0];

      let remoteVideo = document.getElementById("remoteVideo")
      if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
          remoteVideo.srcObject = recievedStream;
      }

      if(presenterStream==null) {
        presenterStream = recievedStream;
      }
  };
}

function setupChildNeighbour(id) {
    if(presenterStream!=null) {
        presenterStream.getTracks().forEach(track => connections[nodeID].addTrack(track, stream));
    }

    connections[id].onicecandidate = event => {
        if (event.candidate) {
            sendMessage({'candidate': event.candidate}, "candidate", id);
        }
    };

    connections[id].ontrack = event => {
        const recievedStream = event.streams[0];

        // let remoteVideo = document.getElementById("remoteVideo")
        // if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
        //     remoteVideo.srcObject = recievedStream;
        // }
    };
}

function sendMessage(msg, msgType, id) {
  let newMessage = {
    sourceID: currID,
    destinationID : id,
    type: msgType,
    message: msg
  }
  socket.to(roomName).emit('message', newMessage);
}
  
function sendOffer(id) {
  connections[id].createOffer().then(function(description) {
    connections[id].setLocalDescription(description).then(function() {
      sendMessage({'sdp': connections[id].localDescription}, "sdp", id);
    }).catch(onError);
  }); 
}

function pageReady() { 
    const socket = io.connect(); //installation and import pending

    socket.on('connect', function() {
        socket.emit('room', roomName); //send roomName to server
    });

    socket.on('connected', function(data) { //get currentId from server
        nodeID = data.peerID;
        parentNodeID = data.parentID; //let -1 be default 

        if(parentNodeID!=-1) {
            connections[parentNodeID] = new RTCPeerConnection(configuration);
            setupParentNode(parentNodeID);

            //send member_ready message to parent
            sendMessage("member_ready", "member_ready", parentNodeID);
        }

        if(nodeID==0) { // or parent is neg
            isTeacher = true; //temporarily making 0 as teacher
        }
    });
    
    socket.on('message', function(data) {
        let senderID = data.sourceID;
        let intendedRecieverID = data.destinationID;

        if(nodeID != intendedRecieverID) {
            return;
        }

        /**
         * Type: memberReady -> Recieved ready message from child
         * Action: setup connection object and send offer to that child
         */
        
         //should take left or right from server
        if(data.type=="memberReady") {

            if(leftChildID != null) {
                leftChildID = senderID;
                connections[leftChildID] = new RTCPeerConnection(configuration);
                setupChildNeighbour(leftChildID);
            }
            else {
                rightChildID = senderID;
                connections[rightChildID] = new RTCPeerConnection(configuration);
                setupChildNeighbour(rightChildID);
            }

            sendOffer(senderID);
        }

        /**
         * Type: sdp
         * Action: if it is an offer, create and send an answer back
         */

        if(data.type=="sdp") {
            let message = data.message;
            connections[senderID].setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
                if (connections[senderID].remoteDescription.type === 'offer') {
                    connections[senderID].createAnswer().then(function(description) {
                        connections[senderID].setLocalDescription(description).then(function() {
                        sendMessage({'sdp': connections[senderId].localDescription}, "sdp", senderID);
                        }).catch(onError);
                    });
                }
            }, onError);
        }

        /**
         * Type: candidate
         * Action: add the recieved iceCandidate
         */
        if(data.type=="candidate") {
            let message = data.message;
            connections[senderID].addIceCandidate(
                new RTCIceCandidate(message.candidate), onSuccess, onError
            );
        }

    });

    if(isTeacher) {
        navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
          }).then(stream => {

            localVideo.srcObject = stream;
            presenterStream = stream;
        });
    }
}