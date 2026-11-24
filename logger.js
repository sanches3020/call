function write(level, message) {
    const timestamp = new Date().toISOString()
    const logLine = timestamp + ' ' + level + ' ' + message
    console.log(logLine)
}

process.on('unhandledRejection', (reason) => {
    const detail = reason?.stack || String(reason)
    write('ERROR', 'Unhandled Rejection в процессе: ' + detail)
})

process.on('uncaughtException', (err) => {
    const detail = err?.stack || String(err)
    write('ERROR', 'Uncaught Exception в процессе: ' + detail)
})

export default {
    log(data) {
        if (typeof data === 'object' && data !== null) {
            write('INFO', JSON.stringify(data))
        } else {
            write('INFO', String(data))
        }
    },
    error(data) {
        if (typeof data === 'object' && data !== null) {
            write('ERROR', JSON.stringify(data))
        } else {
            write('ERROR', String(data))
        }
    },

    init(wss) {
        this.log('START :8080')

        wss.on('error', this.error)

        wss.on('connection', (socket, req) => {
            const ip = req.socket.remoteAddress
            this.log('OPEN (' + ip + ')')

            socket._originalSend = socket.send

            socket.send = (data, options, callback) => {
                const clientName = socket.name ? ' [' + socket.name + ']' : ''
                this.log('SENT to (' + ip + ')' + clientName + ' = ' + String(data))
                socket._originalSend(data, options, callback)
            }

            socket.on('message', (data) => {
                this.log('RECEIVED (' + ip + ') = ' + String(data))
            })

            socket.on('error', (err) => {
                this.error('ERROR (' + ip + ') = ' + (err?.message || String(err)))
            })

            socket.on('close', (code, reason) => {
                this.error('CLOSED (' + ip + ') = Код: ' + code + ', Причина: ' + (String(reason) || 'нет'))
            })
        })
    }
}
