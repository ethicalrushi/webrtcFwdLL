if (!location.hash) {
    location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
  }
  const roomHash = location.hash.substring(1);

  const roomName = 'observable-' + roomHash;
  const configuration = {
    iceServers: [{
      urls: 'stun:stun.l.google.com:19302'
    }],
 
  };


  let room;
  let pc;

  let connections = [];

  let currentStream;

  let children;
  let parentNode;
  
  console.log(roomName)
  
  function onSuccess() {};
  function onError(error) {
    console.error(error);
  };
  
  let currID;

  const socket = io.connect(); 

  socket.on('connecty', function() {
    socket.emit('create/join', roomName); //send roomName to server
});

socket.on('created/joined', function(data) { //get currentId from server
        currID = data.nodeID;
        console.log("currId", currID);
  
        children = [currID+2, currID+3];
        if(currID%2==0) {
            children = [];
        }
        if(currID==0) {
            children = [1,2];
        }
  
      if(currID%2==0) { //even
          parentNode = currID-3;
      }
      else {
          parentNode = currID-2;
      }
  
      if(currID===1 || currID===2) {
          parentNode = 0;
      }
  
  
        if(!connections[currID]) {
          connections[currID] = new RTCPeerConnection(configuration);
        }
    
        navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        }).then(stream => {
    
          localVideo.srcObject = stream;
  
          let neighbours = [];
          for(let x of children) {
              neighbours.push(x);
          }
          if(parentNode>=0) {
              neighbours.push(parentNode);
          }
          let videoId = 2;
          console.log(neighbours, children);
          for(let i of neighbours) {
              console.log(i); 
            if(!connections[i]) {
              console.log("Creating new for "+i);
              connections[i] = new RTCPeerConnection(configuration);
            
              connections[i].onicecandidate = event => {
                if (event.candidate) {
                  sendMessage({'candidate': event.candidate}, i);
                }
              };
              
              //presenter's track
              if(currID==0) {
                console.log(stream.getTracks());
                stream.getTracks().forEach(track => connections[i].addTrack(track, stream));
              }
    
              connections[i].ontrack = event => {
                console.log("video by:"+i);
                const stream = event.streams[0];
                let remoteVideoName = "remoteVideo"+Math.floor(videoId/2);
                videoId++;
                remoteVideo = document.getElementById(remoteVideoName)
                if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
                  remoteVideo.srcObject = stream;
                }
    
                // passing on the recieved stream ahead
                if(currID!=0 && i<currID) {
                  var newStream = stream.clone();
                  for(let child of children) {
                      console.log("child adding ", child);
                      stream.getTracks().forEach(track => connections[child].addTrack(track, stream));
                  }
                }
              };
            }
          }
  
          if(currID>0){
              sendMessage({'member_ready':"Memeber ready to recieve"}, parentNode);
          }
      });
});

socket.on('message', function(message) {

    if(message.destId!=currID) {
        return;
      }

      console.log("recieved ", message);
      let pId = message.peerId;
  
      if (message.msg.sdp) {
        connections[pId].setRemoteDescription(new RTCSessionDescription(message.msg.sdp), () => {
          if (connections[pId].remoteDescription.type === 'offer') {
            connections[pId].createAnswer().then(function(description) {
              connections[pId].setLocalDescription(description).then(function() {
                sendMessage({'sdp': connections[pId].localDescription}, pId);
              }).catch(onError);
          });
          }
        }, onError);
      } else if (message.msg.candidate) {
        connections[pId].addIceCandidate(
          new RTCIceCandidate(message.msg.candidate), onSuccess, onError
        );
      }
      else if(message.msg.member_ready) {
          startWebRTC(true, message.peerId); //call the ready child
      }

});

  function sendMessage(message, i) {
    let newMessage = {
      peerId: currID,
      destId : i,
      msg: message
    }
  
    message = newMessage
    console.log("sending this: ", message);
    console.log(roomName);
    socket.emit("message", message);
    // drone.publish({
    //   room: roomName,
    //   message
    // });

  }
  
  function startWebRTC(isOfferer, i) {
    console.log("startwebrtc for "+i+" isoffrere: "+isOfferer);

    if (isOfferer) {
        connections[i].createOffer().then(function(description) {
          connections[i].setLocalDescription(description).then(function() {
            sendMessage({'sdp': connections[i].localDescription}, i);
          }).catch(onError);
      });
    }
  }
  
  