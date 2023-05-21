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
                const subflows = JSON.parse(subflowContents);
                RED.nodes.registerSubflow(subflows);
                RED.log.info(`registerSubflow:${subflows.name}`)
            }
        }
    });
}