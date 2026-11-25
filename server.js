import express from 'express'
import fs from 'fs'
const app = express()
app.use(express.static('.'))
app.listen(801)

import {WebSocketServer} from 'ws'
const wss = new WebSocketServer({port: 8070})

const allClients = []

var users = []
var history = []
if(fs.existsSync("history.jsonl"))
    history = fs.readFileSync("history.jsonl", { encoding: 'utf8'}).split("\n").filter(Boolean)
for(var line of history){
    users.push(JSON.parse(line))
}


wss.on('connection', (client, request) => {
    const name = new URLSearchParams(request.url.split('?')[1] ?? '').get('name')

    if (!name || allClients.some(s => s.name === name)) return client.close()

    client.name = name

    client.on('message', (message) => {
        const data = JSON.parse(message)
        if(data.type === "user_info"){
            fs.appendFileSync("history.jsonl", JSON.stringify(data) + "\n")
        }

        allClients.forEach(target => {
            if (target.name === data.to && target.readyState === 1) {
                target.send(JSON.stringify({from: client.name, type: data.type, message: data.message}))
            }
        })
    })

    client.on('close', () => allClients.splice(allClients.indexOf(client), 1))

    allClients.push(client)
})
import logger from './logger.js'
logger.init(wss)
