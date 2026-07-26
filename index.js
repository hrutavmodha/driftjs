import { interprete } from "./packages/compiler/dist/src/index.js";

const template = `
    <script src="index.js" type="module"> 
        let x = 10;
        let y = 20;
    </script>
    <h1>Hello, {name}</h1>
`

interprete(template, true);
