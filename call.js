const RTC_CONFIG = {
    iceServers: [/*{
        urls: 'stun:://google.com'
    }, */{
        urls: 'turn:77.37.49.7:3478',
        username: 'user',
        credential: 'pass'
    }]
}
class Call {
    peer = null
    audioStream = null
    screenStream = null
    send = null
    status = null
    videoElementId = null
    isSpeaking = false
    speakTimeout = null
    duration = 0
    durationTimer = null
    localCandidates = []
    remoteCandidates = []

    constructor(send, status, videoElementId) {
        this.send = send
        this.status = status || function () {
        }
        this.videoElementId = videoElementId
        this.peer = new RTCPeerConnection(RTC_CONFIG)
        this.peer.onconnectionstatechange = () => {
            if (this.peer.connectionState === 'connected') {
                this.callConnected()
            }
            if (this.peer.connectionState === 'disconnected' || this.peer.connectionState === 'failed') {
                this.callStop()
            }
        }
        this.peer.onicecandidate = event => {
            if (event && event.candidate) {
                if (this.peer.remoteDescription) {
                    this.send('call_candidate', event.candidate)
                } else {
                    this.localCandidates.push(event.candidate)
                }
            }
        }
        this.peer.ontrack = (event) => {
            this.streamPlay(event)
        }
    }
    streamPlay(event) {
        if (event.track.kind === 'audio') {
            const stream = (event.streams && event.streams.at(0)) || new MediaStream([event.track])
            let audio = new Audio()
            audio.srcObject = stream
            audio.play()
            this.status('audio_play')
            this.initAudioAnalyser(stream)
        } else if (event.track.kind === 'video') {
            const stream = (event.streams && event.streams.at(0)) || new MediaStream([event.track])
            this.screenStream = stream
            this.status('video_play')
            let videoEl = document.getElementById(this.videoElementId)
            if (videoEl) {
                videoEl.srcObject = stream
                videoEl.muted = true
                videoEl.play().catch(() => {})
            }
        }
    }
    async callStart() {
        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia({audio: true})
            this.audioStream.getTracks().forEach((track) => {
                this.peer.addTrack(track, this.audioStream)
            })
            const offer = await this.peer.createOffer()
            await this.peer.setLocalDescription(offer)
            this.status('call_start', 'Ждём ответа...')
            this.send('call_start', this.peer.localDescription)
        } catch (error) {
            this.status('error', error.toString())
        }
    }
    async messageReceive(data) {
        if (data.type === 'call_start') {
            try {
                await this.peer.setRemoteDescription(data.message)
                this.audioStream = await navigator.mediaDevices.getUserMedia({audio: true})
                this.audioStream.getTracks().forEach((track) => {
                    this.peer.addTrack(track, this.audioStream)
                })
                await this.peer.setLocalDescription(await this.peer.createAnswer())
                this.status('call_connecting', 'Подключение...')
                this.send('call_answer', this.peer.localDescription)
                this.localCandidates.forEach(candidate => this.send('call_candidate', candidate))
                this.remoteCandidates.forEach(candidate => this.peer.addIceCandidate(candidate))
            } catch (err) {
                this.status('error', err.toString())
            }
        } else if (data.type === 'call_offer') {
            if (this.peer) {
                try {
                    await this.peer.setRemoteDescription(data.message)
                    const answer = await this.peer.createAnswer()
                    await this.peer.setLocalDescription(answer)
                    this.send('call_answer', this.peer.localDescription)
                } catch (err) {
                    this.status('error', err.toString())
                }
            }
        } else if (data.type === 'call_answer') {
            if (this.peer) {
                try {
                    if (this.peer.signalingState !== 'have-local-offer')
                        return
                    this.status('call_connecting', 'Подключение...')
                    await this.peer.setRemoteDescription(data.message)
                    this.localCandidates.forEach(candidate => this.send('call_candidate', candidate))
                    this.remoteCandidates.forEach(candidate => this.peer.addIceCandidate(candidate))
                } catch (err) {
                    this.status('error', err.toString())
                }
            }
        } else if (data.type === 'call_candidate') {
            if (this.peer) {
                if (this.peer.remoteDescription) {
                    this.peer.addIceCandidate(data.message)
                } else {
                    this.remoteCandidates.push(data.message)
                }
            }
        } else if (data.type === 'call_stop') {
            this.callStop()
        } else if (data.type === 'video_stop') {
            this.status('video_stop')
        }
    }
    callConnected() {
        if (!this.durationTimer) {
            this.durationTimer = setInterval(() => {
                this.duration++
                let m = Math.floor(this.duration / 60).toString().padStart(2, '0')
                let s = (this.duration % 60).toString().padStart(2, '0')
                this.status('call_duration', m + ':' + s)
            }, 1000)
        }
        this.status('call_connected', 'Подключено')
    }
    toggleMute() {
        if (this.audioStream && this.audioStream.getAudioTracks().at(0)) {
            let track = this.audioStream.getAudioTracks().at(0)
            if (track.enabled) {
                track.enabled = false
                this.status('audio_mute')
            } else {
                track.enabled = true
                this.status('audio_unmute')
            }
        }
    }
    async shareScreen() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({video: true})
            const screenTrack = this.screenStream.getVideoTracks().at(0)
            if (this.peer) {
                this.peer.addTrack(screenTrack, this.screenStream)
                const offer = await this.peer.createOffer()
                await this.peer.setLocalDescription(offer)
                this.send('call_offer', this.peer.localDescription)
                this.status('video_start')
                this.streamPlay({track: screenTrack, streams: [this.screenStream]})
            }
        } catch (error) {
            this.status('error', error.toString())
        }
    }
    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop())
            if (this.peer) {
                let sender = this.peer.getSenders().find(s => s.track && s.track.kind === 'video')
                if (sender) this.peer.removeTrack(sender)
            }
            this.send('video_stop', {})
            this.status('video_stop')
            this.screenStream = null
        }
    }
    initAudioAnalyser(stream) {
        let ctx = new (window.AudioContext || window.webkitAudioContext)()
        let src = ctx.createMediaStreamSource(stream)
        let analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        src.connect(analyser)
        let bufferLength = analyser.frequencyBinCount
        let dataArray = new Uint8Array(bufferLength)
        let checkVolume = () => {
            if (!this.peer) return
            analyser.getByteFrequencyData(dataArray)
            let total = dataArray.reduce((acc, val) => acc + val, 0)
            let average = total / bufferLength
            if (average > 25) {
                if (!this.isSpeaking) {
                    this.isSpeaking = true
                    this.status('audio_start')
                }
                if (this.speakTimeout) clearTimeout(this.speakTimeout)
                this.speakTimeout = setTimeout(() => {
                    this.isSpeaking = false
                    this.status('audio_stop')
                }, 1000)
            } else if (this.isSpeaking && !this.speakTimeout) {
                this.speakTimeout = setTimeout(() => {
                    this.isSpeaking = false
                    this.status('audio_stop')
                }, 1000)
            }
            requestAnimationFrame(checkVolume)
        }
        checkVolume()
    }
    hangup() {
        this.callStop()
        this.send('call_stop')
    }
    callStop() {
        this.audioStream?.getTracks().forEach(track => track.stop())
        this.screenStream?.getTracks().forEach(track => track.stop())
        this.peer?.close()
        if (this.speakTimeout)
            clearTimeout(this.speakTimeout)
        if (this.durationTimer)
            clearInterval(this.durationTimer)
        this.status('call_stop')
    }
}
