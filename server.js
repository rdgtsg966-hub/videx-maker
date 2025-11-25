const express=require("express");
const cors=require("cors");
const bodyParser=require("body-parser");
const app=express();
app.use(cors());
app.use(bodyParser.json());

app.post("/api/generate",(req,res)=>{
    const {url}=req.body;
    if(!url) return res.json({ok:false,message:"URL obrigatória"});

    return res.json({
        ok:true,
        downloadUrl:"https://videx-maker.onrender.com/sample-demo.mp4"
    });
});

app.get("/",(req,res)=>res.send("Videx Maker API OK"));
app.listen(3000,()=>console.log("API rodando"));
