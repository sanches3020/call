import express from 'express'
import fs from 'fs'
import http from 'http'
const app = express()
app.use(express.static('.'))

const server = http.createServer(app)

import {WebSocketServer} from 'ws'
const wss = new WebSocketServer({ server })

const connections = []

var users = []
var history = []
if (fs.existsSync("history.jsonl"))
    history = fs.readFileSync("history.jsonl", { encoding: 'utf8' }).split("\n").filter(Boolean)
for (var line of history) {
    users.push(JSON.parse(line))
}


wss.on('connection', (conn, request) => {
    const name = new URLSearchParams(request.url.split('?')[1] ?? '').get('name')

    if (!name || connections.some(s => s.name === name)) return conn.close()

    connections.push(conn)
    conn.name = name

    conn.on('message', (message) => {
        const data = JSON.parse(message)
        if (data.type === "user_info") {
            fs.appendFileSync("history.jsonl", JSON.stringify(data) + "\n")
        }

        connections.forEach(client => {
            if (client.name === data.to && client.readyState === 1) {
                client.send(JSON.stringify({from: conn.name, type: data.type, message: data.message}))
            }
        })
    })

    conn.on('close', () => connections.splice(connections.indexOf(conn), 1))

})
import logger from './logger.js'
logger.init(wss)

const PORT = process.env.PORT ?? 801
server.listen(PORT, () => {
    console.log('HTTP + WebSocket listening on port ' + PORT)
    logger.log('START on port ' + PORT)
})