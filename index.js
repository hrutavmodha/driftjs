import { interprete } from "./packages/compiler/dist/drift.mjs";

const template = `
    <ul>
        @for (item, index) in list {
            <li key={index}>{item}</li>
        }
    </ul>
`

interprete(template, true);