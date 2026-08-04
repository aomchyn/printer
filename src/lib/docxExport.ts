import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { DocxMerger } from "@spfxappdev/docxmerger";
// @ts-ignore
import ImageModule from "docxtemplater-image-module-free";

const getArrayBuffer = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not fetch ${url}`);
    return await response.arrayBuffer();
};

const emptyImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const getEmptyImageArrayBuffer = () => {
    const binary_string = window.atob(emptyImageBase64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
};

const imageOptions = {
    centered: false,
    getImage: async (tagValue: string) => {
        if (!tagValue) return getEmptyImageArrayBuffer();
        try {
            return await getArrayBuffer(tagValue);
        } catch (error) {
            console.error("Error fetching image:", error);
            return getEmptyImageArrayBuffer();
        }
    },
    getSize: () => {
        // Adjust size to fit in the document's table cell
        return [80, 30];
    }
};

export const generateDocument = async (templateUrl: string, fileName: string, data: any) => {
    const templateBuffer = await getArrayBuffer(templateUrl);
    const zip = new PizZip(templateBuffer);
    
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        modules: [new ImageModule(imageOptions)]
    });
    
    await doc.resolveData(data);
    doc.render();
    
    const out = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    
    saveAs(out, fileName);
};

export const generateMultipleDocumentsAsZip = async (templateUrl: string, zipName: string, records: {fileName: string, data: any}[]) => {
    const templateBuffer = await getArrayBuffer(templateUrl);
    const resultZip = new JSZip();
    
    for (const record of records) {
        const zip = new PizZip(templateBuffer);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            modules: [new ImageModule(imageOptions)]
        });
        
        await doc.resolveData(record.data);
        doc.render();
        
        const docBuffer = doc.getZip().generate({
            type: "arraybuffer",
        });
        
        resultZip.file(record.fileName, docBuffer);
    }
    
    const outZip = await resultZip.generateAsync({ type: "blob" });
    saveAs(outZip, zipName);
};

export const generateMergedDocumentsToSingleDocx = async (templateUrl: string, fileName: string, records: {data: any}[]) => {
    const templateBuffer = await getArrayBuffer(templateUrl);
    
    const buffers: ArrayBuffer[] = [];
    
    for (const record of records) {
        const zip = new PizZip(templateBuffer);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            modules: [new ImageModule(imageOptions)]
        });
        
        await doc.resolveData(record.data);
        doc.render();
        
        const docBuffer = doc.getZip().generate({
            type: "arraybuffer",
        });
        
        buffers.push(docBuffer);
    }
    
    if (buffers.length === 1) {
        const blob = new Blob([buffers[0]], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        saveAs(blob, fileName);
        return;
    }

    const merger = new DocxMerger();
    await merger.merge(buffers, { pageBreak: true });
    const mergedData = await merger.save();
    const mergedBlob = new Blob([mergedData], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    saveAs(mergedBlob, fileName);
};
