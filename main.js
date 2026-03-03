const express = require('express')
const app = express()
const port = 3000
app.use(express.json())
let data = [
    {
        "id": "1",
        "title": "a title",
        "views": 100
    },
    {
        "id": "2",
        "title": "another title",
        "views": 200
    },
    {
        "id": "3",
        "title": "another title",
        "views": 200
    },
    {
        "id": "4",
        "title": "chu tu",
        "views": 900
    },
    {
        "id": "5",
        "title": "to",
        "views": 900
    },
    {
        "id": "6",
        "title": "hahah",
        "views": 999
    },
    {
        "id": "7",
        "title": "hehehhe",
        "views": 999
    },
    {
        "id": "99",
        "title": "909999",
        "views": 99
    },
    {
        "id": "9999",
        "title": "99",
        "views": 999,
        "isDeleted": true
    }
]
//HTTP REQUEST ->get,post,put,delete
app.get('/api/v1/products', (req, res) => {
    let titleQ = req.query.title ? req.query.title : '';
    let maxView = req.query.maxview ? req.query.maxview : 10000;
    let minView = req.query.minview ? req.query.minview : 0;
    let limit = req.query.limit ? req.query.limit : 5;
    let page = req.query.page ? req.query.page : 1;
    let result = data.filter(function (e) {
        return !(e.isDeleted) && e.title.includes(titleQ)
            && e.views >= minView && e.views <= maxView
    })
    result = result.splice(limit * (page - 1), limit)
    res.send(result)
})
app.get('/api/v1/products/:id', (req, res) => {
    let id = req.params.id;
    let result = data.filter(function (e) {
        return !(e.isDeleted) && e.id == id
    })
    if (result.length > 0) {
        res.send(result[0])
    } else {
        res.status(404).send({
            message: "ID NOT FOUND"
        })
    }
})
//post -> create
app.post('/api/v1/products/', (req, res) => {
    let newItem = {
        id: genID(data) + "",
        title: req.body.title,
        views: req.body.views
    }
    data.push(newItem);
    res.send(newItem)
})
//put - >edit
app.put('/api/v1/products/:id', (req, res) => {
    let id = req.params.id;
    let getProduct = data.filter(
        function (e) {
            return e.id == id && !e.isDeleted
        }
    )
    if (getProduct.length > 0) {
        getProduct = getProduct[0]
        let keys = Object.keys(req.body);
        for (const key of keys) {
            if (getProduct[key]) {
                getProduct[key] = req.body[key]
            }
        }
        res.send(getProduct)
    } else {
        res.status(404).send({
            message: "id not found"
        })
    }
})
//delete -> xoa
app.delete('/api/v1/products/:id', (req, res) => {
    let id = req.params.id;
    let getProduct = data.filter(
        function (e) {
            return e.id == id && !e.isDeleted
        }
    )
    if (getProduct.length > 0) {
        getProduct = getProduct[0]
        getProduct.isDeleted = true;
        res.send(getProduct)
    } else {
        res.status(404).send({
            message: "id not found"
        })
    }
})
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
function genID(data) {
    let ids = data.map(
        function (e) {
            return Number.parseInt(e.id)
        }
    )
    return Math.max(...ids) + 1
}
