import re

with open('src/pages/Dashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "{/* CHART RENDERING: BARS OR AREA */}"
end_marker = "                  <div className=\"flex items-center justify-between pt-2 border-t border-outline-variant/10 text-[11px] text-stone-500\">"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_chart_code = """{/* CHART RENDERING: BARS OR AREA */}
                  <div className="relative z-10 h-[240px] w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartStyle === 'area' ? (
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#e9c349" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#e9c349" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.5} />
                          <XAxis 
                            dataKey="label" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#78716c', fontSize: 10 }}
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#78716c', fontSize: 10 }}
                            tickFormatter={(value) => {
                              if (metricType === 'revenue') {
                                return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value;
                              }
                              return value;
                            }}
                          />
                          <RechartsTooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const val = payload[0].value as number;
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-[#121212] border border-[#333] p-3 rounded-xl shadow-xl">
                                    <p className="text-xs text-stone-400 mb-1">{label}</p>
                                    <p className="text-sm font-bold text-[#e9c349] font-mono">
                                      {metricType === 'revenue' 
                                        ? new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(val)
                                        : metricType === 'transactions'
                                        ? `${val} Vendas (${data.pending} pendentes)`
                                        : `${val} Alunos`
                                      }
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey={metricType === 'revenue' ? 'revenue' : metricType === 'transactions' ? 'transactions' : 'students'}
                            stroke="#e9c349" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorValue)" 
                            activeDot={{ r: 6, fill: '#e9c349', stroke: '#121212', strokeWidth: 2 }}
                          />
                        </AreaChart>
                      ) : (
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.5} />
                          <XAxis 
                            dataKey="label" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#78716c', fontSize: 10 }}
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#78716c', fontSize: 10 }}
                            tickFormatter={(value) => {
                              if (metricType === 'revenue') {
                                return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value;
                              }
                              return value;
                            }}
                          />
                          <RechartsTooltip 
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const val = payload[0].value as number;
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-[#121212] border border-[#333] p-3 rounded-xl shadow-xl">
                                    <p className="text-xs text-stone-400 mb-1">{label}</p>
                                    <p className="text-sm font-bold text-[#e9c349] font-mono">
                                      {metricType === 'revenue' 
                                        ? new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(val)
                                        : metricType === 'transactions'
                                        ? `${val} Vendas (${data.pending} pendentes)`
                                        : `${val} Alunos`
                                      }
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar 
                            dataKey={metricType === 'revenue' ? 'revenue' : metricType === 'transactions' ? 'transactions' : 'students'}
                            fill="#e9c349" 
                            radius={[4, 4, 0, 0]}
                          >
                            {
                              chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={hoveredDataPoint?.label === entry.label ? '#fcd34d' : '#e9c349'} />
                              ))
                            }
                          </Bar>
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>

"""
    new_content = content[:start_idx] + new_chart_code + content[end_idx:]
    with open('src/pages/Dashboard.tsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Chart replaced successfully.")
else:
    print("Could not find markers.")

