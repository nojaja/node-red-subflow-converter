const fs = require("fs");
const path = require("path");

module.exports = function (RED) {
    const subflowpath = path.join(__dirname,"subflow")

    fs.readdir(subflowpath, function(err, files){
        if (err) throw err;

        for (const file of files) {
            const filepath = path.join(subflowpath,file)
            if(fs.statSync(filepath).isFile() && /\.json$/.test(filepath)) {
                const subflowContents = fs.readFileSync(filepath);
                const subflowJSON = JSON.parse(subflowContents);
                for (const element of subflowJSON) {
                    //subflowを探す
                    if(element.type=="subflow"){
                        const subflows = element
                        subflows.flow = []
                        for (const flow of subflowJSON) {
                            if(flow.z==subflows.id){//flow.zがsubflowsのIDと同じ場合は、そのsubflowsに属している
                                subflows.flow.push(flow)
                            }
                        }
                        RED.nodes.registerSubflow(subflows);
                    }
                } 
            }
        }
    });
}