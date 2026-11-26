import express from 'express'
import fs from 'fs'
import http from 'http'
const app = express()
app.use(express.static('.'))

const server = http.createServer(app)

import {WebSocketServer} from 'ws'
const wss = new WebSocketServer({ server })

const allClients = []

var users = []
var history = []
if (fs.existsSync("history.jsonl"))
    history = fs.readFileSync("history.jsonl", { encoding: 'utf8' }).split("\n").filter(Boolean)
for (var line of history) {
    users.push(JSON.parse(line))
}


wss.on('connection', (client, request) => {
    const name = new URLSearchParams(request.url.split('?')[1] ?? '').get('name')

    if (!name || allClients.some(s => s.name === name)) return client.close()

    client.name = name

    client.on('message', (message) => {
        const data = JSON.parse(message)
        if (data.type === "user_info") {
            fs.appendFileSync("history.jsonl", JSON.stringify(data) + "\n")
        }

        allClients.forEach(client => {
            if (client.name === data.to && client.readyState === 1) {
                client.send(JSON.stringify({from: client.name, type: data.type, message: data.message}))
            }
        })
    })

    client.on('close', () => allClients.splice(allClients.indexOf(client), 1))

    allClients.push(client)
})
import logger from './logger.js'
logger.init(wss)

server.listen(801, () => {
    console.log('HTTP + WebSocket listening on port 801')
})