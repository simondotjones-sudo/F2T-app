import type {Language} from './i18n';
import type {LocationTerm} from './tenant-types';
// Noun forms used by the existing interface dictionaries. Apply only to known
// interface templates, before interpolation: never to customer-authored values.
const forms:Record<Language,[string,string][]>={
 en:[['stores','sites'],['store','site']],
 fr:[['magasins','sites'],['magasin','site']],
 es:[['tiendas','centros'],['tienda','centro']],
 de:[['Filialen','Standorte'],['Filiale','Standort']],
 it:[['negozi','sedi'],['negozio','sede']],
 nl:[['winkels','locaties'],['winkel','locatie']],
 pt:[['lojas','locais'],['loja','local']],
 pl:[['sklepów','placówek'],['sklepami','placówkami'],['sklepach','placówkach'],['sklepu','placówki'],['sklepie','placówce'],['sklepy','placówki'],['sklep','placówka']],
 ro:[['magazinelor','locațiilor'],['magazinele','locațiile'],['magazinul','locația'],['magazine','locații'],['magazin','locație']],
 cs:[['prodejen','poboček'],['prodejnách','pobočkách'],['prodejny','pobočky'],['prodejnu','pobočku'],['prodejně','pobočce'],['prodejna','pobočka']],
 sk:[['predajní','pobočiek'],['predajniach','pobočkách'],['predajne','pobočky'],['predajňu','pobočku'],['predajni','pobočke'],['predajňa','pobočka']],
 sl:[['trgovinah','lokacijah'],['trgovin','lokacij'],['trgovine','lokacije'],['trgovini','lokaciji'],['trgovino','lokacijo'],['trgovina','lokacija']],
 hu:[['üzletek','telephelyek'],['üzlet','telephely']],
 ar:[['المتاجر','المواقع'],['متاجر','مواقع'],['المتجر','الموقع'],['متجر','موقع']],
};
export function locationCopy(lang:Language,text:string,term:LocationTerm){
 const pairs=forms[lang].map(([store,site])=>term==='site'?[store,site]:[site,store]);
 const pattern=pairs.map(([from])=>from).sort((a,b)=>b.length-a.length).join('|');
 return text.replace(new RegExp(`(?<![\\p{L}{])(${pattern})(?![\\p{L}}])`,'giu'),match=>{
  const pair=pairs.find(([from])=>from.toLocaleLowerCase()===match.toLocaleLowerCase());
  if(!pair)return match;
  const to=pair[1];return match===match.toUpperCase()?to.toUpperCase():match[0]===match[0].toUpperCase()?to[0].toUpperCase()+to.slice(1):to.toLowerCase();
 });
}
