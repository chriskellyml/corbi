xquery version "1.0-ml";
(: Example Custom Processor :)
declare variable $URI as xs:string external;
xdmp:log($URI)